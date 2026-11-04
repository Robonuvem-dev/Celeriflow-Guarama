import { and, desc, eq, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetWriteOffs, assetIntegrationPendingConfigurations } from "@/db/schema/assets";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { FinanceError, postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { assertAssetValuationOrigin, resolveAssetValuationScope, type AssetValuationContext } from "./valuation-accounting";

export async function reverseAssetWriteOff(connection: DatabaseConnection, context: AssetValuationContext, input: { recordId: string; date: Date; reason: string }) {
  if (!input.recordId.trim() || input.reason.trim().length < 10 || !Number.isFinite(input.date.valueOf())) throw new FinanceError("Informe baixa, data e fundamento do estorno (mínimo 10 caracteres).");
  return withDatabaseTransaction(connection, async tx => {
    const [loaded] = await tx.select({ record: assetWriteOffs }).from(assetWriteOffs).innerJoin(assets, eq(assets.id, assetWriteOffs.assetId)).where(or(eq(assetWriteOffs.id, input.recordId), and(eq(assets.patrimonyNumber, input.recordId), eq(assetWriteOffs.status, "Aprovada")))).orderBy(desc(assetWriteOffs.date)).limit(1);
    const record = loaded?.record;
    if (!record || record.type !== "Baixa") throw new FinanceError("Selecione uma baixa sem alienação; alienações exigem conciliação da receita antes do estorno.");
    await tx.execute(sql`SELECT id FROM "Asset" WHERE id=${record.assetId} FOR UPDATE`);
    const scope = await resolveAssetValuationScope(tx, context, input.date);
    await assertAssetValuationOrigin(tx, record.assetId, context, scope.unit.secretariatId!);
    if (record.status === "Estornada") return record;
    if (input.date < record.date) throw new FinanceError("O estorno não pode anteceder a baixa.");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, record.assetId)).limit(1);
    if (!asset || asset.status !== "Baixado") throw new FinanceError("O bem não está baixado.");
    if (record.accountingTransactionId) {
      const original = (await tx.execute<{ id: string; status: string; budgetUnitId: string | null; financialYearId: string }>(sql`SELECT id,status,"budgetUnitId","financialYearId" FROM "AccountingTransaction" WHERE id=${record.accountingTransactionId}`)).rows[0];
      if (!original || original.status !== "POSTADO" || original.budgetUnitId !== context.budgetUnitId) throw new FinanceError("Partida original diverge da UG ou não está postada.");
      const entries = (await tx.execute<{ id: string; accountId: string; type: string; valueDecimal: string | null }>(sql`SELECT id,"accountId",type,"valueDecimal" FROM "AccountingEntry" WHERE "transactionId"=${original.id}`)).rows;
      if (!entries.length || entries.some(e => !e.valueDecimal)) throw new FinanceError("Regularize as linhas Decimal da partida original antes do estorno.");
      await postAccountingTransactionInTransaction(tx, context.actor, { financialYearId: scope.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: context.budgetUnitId, date: input.date, history: input.reason.trim(), sourceModule: "PATRIMONIO", sourceType: "ASSET_WRITE_OFF_REVERSAL", sourceId: record.id, eventType: "ASSET_WRITE_OFF_REVERSED", idempotencyKey: `PATRIMONIO:WRITE_OFF_REVERSAL:${record.id}`, reversalOfId: original.id, lines: entries.map(e => ({ originalEntryId: e.id, accountId: e.accountId, type: e.type === "Débito" ? "Crédito" : "Débito", value: new Decimal(e.valueDecimal!) })) });
    }
    await tx.update(assetWriteOffs).set({ status: "Estornada" }).where(and(eq(assetWriteOffs.id, record.id), eq(assetWriteOffs.status, record.status)));
    await tx.update(assetIntegrationPendingConfigurations).set({ status: "CANCELLED" }).where(eq(assetIntegrationPendingConfigurations.assetWriteOffId, record.id));
    await tx.update(assets).set({ status: "Ativo" }).where(eq(assets.id, asset.id));
    await tx.insert(financialAuditLogs).values({ action: "ASSET_WRITE_OFF_REVERSED", entityType: "AssetWriteOff", entityId: record.id, authorUsuarioId: context.actor.usuarioId, authorEmployeeId: context.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, reason: input.reason.trim(), date: input.date.toISOString() } });
    return record;
  });
}
