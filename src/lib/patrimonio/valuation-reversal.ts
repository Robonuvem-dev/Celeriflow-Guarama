import { eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetValueHistories, assetValueAdjustments } from "@/db/schema/assets";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { FinanceError, postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { assertAssetValuationOrigin, resolveAssetValuationScope, type AssetValuationContext } from "./valuation-accounting";
import { cancelMunicipalCostSource } from "@/lib/financeiro/cost-ledger";

type RawAccountingRecord = {
  id: string; governmentEntityId: string | null; budgetUnitId: string | null; financialYearId: string; date: string; history: string; status: string;
  sourceModule: string; sourceType: string; sourceId: string | null; eventType: string; idempotencyKey: string | null;
  authorUsuarioId: string; authorEmployeeId: string | null; postedAt: string | null; reversalOfId: string | null; createdAt: string; updatedAt: string;
};
function accountingRecord(row: RawAccountingRecord) {
  return { ...row, date: databaseTimestamp(row.date), postedAt: row.postedAt === null ? null : databaseTimestamp(row.postedAt), createdAt: databaseTimestamp(row.createdAt), updatedAt: databaseTimestamp(row.updatedAt) };
}

export async function reverseAssetValuation(db: DatabaseConnection, context: AssetValuationContext, input: { kind: "DEPRECIATION" | "ADJUSTMENT"; recordId: string; date: Date; reason: string; idempotencyKey: string }) {
  if (!["DEPRECIATION", "ADJUSTMENT"].includes(input.kind)) throw new FinanceError("Tipo de fato patrimonial inválido.");
  if (!input.recordId.trim() || input.reason.trim().length < 10 || !input.idempotencyKey.trim() || !Number.isFinite(input.date.valueOf())) throw new FinanceError("Informe registro, data, chave e fundamento do estorno patrimonial.");
  return withDatabaseTransaction(db, async tx => {
    const record = input.kind === "DEPRECIATION"
      ? (await tx.select().from(assetValueHistories).where(eq(assetValueHistories.id, input.recordId)).limit(1))[0]
      : (await tx.select().from(assetValueAdjustments).where(eq(assetValueAdjustments.id, input.recordId)).limit(1))[0];
    if (!record) throw new FinanceError("Fato patrimonial não encontrado.");
    await tx.execute(sql`SELECT id FROM "Asset" WHERE id = ${record.assetId} FOR UPDATE`);
    const scope = await resolveAssetValuationScope(tx, context, input.date);
    await assertAssetValuationOrigin(tx, record.assetId, context, scope.unit.secretariatId!);
    if (!record.accountingTransactionId || !record.openingValueDecimal || !record.closingValueDecimal) throw new FinanceError("Estorno exige posição Decimal e partida original conciliadas; registros legados devem ser regularizados individualmente.");
    const rawOriginal = (await tx.execute<RawAccountingRecord>(sql`SELECT t.* FROM "AccountingTransaction" t WHERE t.id=${record.accountingTransactionId}`)).rows[0];
    const original = rawOriginal ? accountingRecord(rawOriginal) : null;
    if (!original || original.status !== "POSTADO" || original.sourceModule !== "PATRIMONIO" || original.sourceType !== "ASSET_VALUATION" || original.sourceId !== record.assetId || original.budgetUnitId !== context.budgetUnitId || original.governmentEntityId !== scope.governmentEntityId || input.date < original.date) throw new FinanceError("Partida/data do estorno diverge da origem patrimonial.");
    const key = `PATRIMONIO:VALUATION_REVERSAL:${input.idempotencyKey.trim()}`;
    const rawReversedBy = (await tx.execute<RawAccountingRecord>(sql`SELECT t.* FROM "AccountingTransaction" t WHERE t."reversalOfId"=${original.id}`)).rows[0];
    const reversedBy = rawReversedBy ? accountingRecord(rawReversedBy) : null;
    if (reversedBy) {
      if (reversedBy.idempotencyKey !== key || reversedBy.date.getTime() !== input.date.getTime() || reversedBy.history !== input.reason.trim()) throw new FinanceError("Fato patrimonial já estornado com outros dados.");
      return reversedBy;
    }
    const [asset] = await tx.select().from(assets).where(eq(assets.id, record.assetId)).limit(1);
    if (!asset || ["Baixado", "Inativo"].includes(asset.status) || !asset.currentValueDecimal?.eq(record.closingValueDecimal)) throw new FinanceError("Bem baixado ou com posição posterior divergente; reverta a cadeia posterior antes deste fato.");
    const latest = (await tx.execute<{ id: string }>(sql`SELECT t.id FROM "AccountingTransaction" t WHERE t."sourceModule"='PATRIMONIO' AND t."sourceType"='ASSET_VALUATION' AND t."sourceId"=${record.assetId} AND t.status='POSTADO' AND NOT EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=t.id) ORDER BY t.date DESC, t."createdAt" DESC, t.id DESC LIMIT 1`)).rows[0];
    if (latest?.id !== original.id) throw new FinanceError("Estorne primeiro os fatos patrimoniais posteriores.");
    const laterReversal = (await tx.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceModule"='PATRIMONIO' AND "sourceType"='ASSET_VALUATION_REVERSAL' AND "sourceId"=${record.assetId} AND date>${input.date} AND status='POSTADO' LIMIT 1`)).rows[0];
    if (laterReversal) throw new FinanceError("A data deve preservar a sequência dos estornos patrimoniais anteriores.");
    const entries = (await tx.execute<{ id: string; accountId: string; type: string; valueDecimal: string | null }>(sql`SELECT id, "accountId", type, "valueDecimal" FROM "AccountingEntry" WHERE "transactionId"=${original.id}`)).rows;
    if (!entries.length || entries.some(entry => !entry.valueDecimal)) throw new FinanceError("Partida original sem linhas Decimal conciliadas.");
    if (input.kind === "DEPRECIATION") await cancelMunicipalCostSource(tx, context.actor, "DEPRECIATION", record.id);
    const reversal = await postAccountingTransactionInTransaction(tx, context.actor, {
      financialYearId: scope.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: context.budgetUnitId,
      date: input.date, history: input.reason.trim(), sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION_REVERSAL", sourceId: record.assetId,
      eventType: "ASSET_VALUATION_REVERSED", idempotencyKey: key, reversalOfId: original.id,
      lines: entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: new Decimal(entry.valueDecimal!) })),
    });
    let acquisition: Decimal | undefined;
    if ("type" in record && record.type === "SUBSEQUENT_COST") {
      if (!record.adjustmentValueDecimal) throw new FinanceError("Custo subsequente sem posição Decimal conciliada.");
      acquisition = (asset.acquisitionValueDecimal ?? new Decimal(String(asset.acquisitionValue))).minus(record.adjustmentValueDecimal);
      if (acquisition.isNegative()) throw new FinanceError("Estorno excede o custo de aquisição conciliado.");
    }
    await tx.update(assets).set({ currentValue: Number(record.openingValueDecimal), currentValueDecimal: record.openingValueDecimal, ...(acquisition ? { acquisitionValue: Number(acquisition), acquisitionValueDecimal: acquisition } : {}) }).where(eq(assets.id, asset.id));
    await tx.insert(financialAuditLogs).values({ action: "ASSET_VALUATION_REVERSED", entityType: input.kind === "DEPRECIATION" ? "AssetValueHistory" : "AssetValueAdjustment", entityId: record.id, authorUsuarioId: context.actor.usuarioId, authorEmployeeId: context.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: context.budgetUnitId, originalTransactionId: original.id, reversalTransactionId: reversal.id, restoredValue: record.openingValueDecimal.toFixed(2), reason: input.reason.trim() } });
    return reversal;
  }, { timeoutMs: 60000 });
}
