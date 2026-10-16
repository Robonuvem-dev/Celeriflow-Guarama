import { Prisma, type PrismaClient } from "@prisma/client";
import { FinanceError, postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { assertAssetValuationOrigin, resolveAssetValuationScope, type AssetValuationContext } from "./valuation-accounting";
import { cancelMunicipalCostSource } from "@/lib/financeiro/cost-ledger";

export async function reverseAssetValuation(db: PrismaClient, context: AssetValuationContext, input: { kind: "DEPRECIATION" | "ADJUSTMENT"; recordId: string; date: Date; reason: string; idempotencyKey: string }) {
  if (!["DEPRECIATION", "ADJUSTMENT"].includes(input.kind)) throw new FinanceError("Tipo de fato patrimonial inválido.");
  if (!input.recordId.trim() || input.reason.trim().length < 10 || !input.idempotencyKey.trim() || !Number.isFinite(input.date.valueOf())) throw new FinanceError("Informe registro, data, chave e fundamento do estorno patrimonial.");
  return db.$transaction(async tx => {
    const record = input.kind === "DEPRECIATION"
      ? await tx.assetValueHistory.findUniqueOrThrow({ where: { id: input.recordId } })
      : await tx.assetValueAdjustment.findUniqueOrThrow({ where: { id: input.recordId } });
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${record.assetId} FOR UPDATE`;
    const scope = await resolveAssetValuationScope(tx, context, input.date);
    await assertAssetValuationOrigin(tx, record.assetId, context, scope.unit.secretariatId!);
    if (!record.accountingTransactionId || !record.openingValueDecimal || !record.closingValueDecimal) throw new FinanceError("Estorno exige posição Decimal e partida original conciliadas; registros legados devem ser regularizados individualmente.");
    const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: record.accountingTransactionId }, include: { entries: true, reversedBy: true } });
    if (original.status !== "POSTADO" || original.sourceModule !== "PATRIMONIO" || original.sourceType !== "ASSET_VALUATION" || original.sourceId !== record.assetId || original.budgetUnitId !== context.budgetUnitId || original.governmentEntityId !== scope.governmentEntityId || input.date < original.date) throw new FinanceError("Partida/data do estorno diverge da origem patrimonial.");
    const key = `PATRIMONIO:VALUATION_REVERSAL:${input.idempotencyKey.trim()}`;
    if (original.reversedBy) {
      if (original.reversedBy.idempotencyKey !== key || original.reversedBy.date.getTime() !== input.date.getTime() || original.reversedBy.history !== input.reason.trim()) throw new FinanceError("Fato patrimonial já estornado com outros dados.");
      return original.reversedBy;
    }
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: record.assetId } });
    if (["Baixado", "Inativo"].includes(asset.status) || !asset.currentValueDecimal?.eq(record.closingValueDecimal)) throw new FinanceError("Bem baixado ou com posição posterior divergente; reverta a cadeia posterior antes deste fato.");
    const latest = await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION", sourceId: record.assetId, status: "POSTADO", reversedBy: { is: null } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (latest?.id !== original.id) throw new FinanceError("Estorne primeiro os fatos patrimoniais posteriores.");
    const laterReversal = await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION_REVERSAL", sourceId: record.assetId, date: { gt: input.date }, status: "POSTADO" }, select: { id: true } });
    if (laterReversal) throw new FinanceError("A data deve preservar a sequência dos estornos patrimoniais anteriores.");
    if (!original.entries.length || original.entries.some(entry => !entry.valueDecimal)) throw new FinanceError("Partida original sem linhas Decimal conciliadas.");
    if (input.kind === "DEPRECIATION") await cancelMunicipalCostSource(tx, context.actor, "DEPRECIATION", record.id);
    const reversal = await postAccountingTransactionInTransaction(tx, context.actor, {
      financialYearId: scope.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: context.budgetUnitId,
      date: input.date, history: input.reason.trim(), sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION_REVERSAL", sourceId: record.assetId,
      eventType: "ASSET_VALUATION_REVERSED", idempotencyKey: key, reversalOfId: original.id,
      lines: original.entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal! })),
    });
    let acquisition: Prisma.Decimal | undefined;
    if ("type" in record && record.type === "SUBSEQUENT_COST") {
      if (!record.adjustmentValueDecimal) throw new FinanceError("Custo subsequente sem posição Decimal conciliada.");
      acquisition = (asset.acquisitionValueDecimal ?? new Prisma.Decimal(String(asset.acquisitionValue))).minus(record.adjustmentValueDecimal);
      if (acquisition.isNegative()) throw new FinanceError("Estorno excede o custo de aquisição conciliado.");
    }
    await tx.asset.update({ where: { id: asset.id }, data: { currentValue: Number(record.openingValueDecimal), currentValueDecimal: record.openingValueDecimal, ...(acquisition ? { acquisitionValue: Number(acquisition), acquisitionValueDecimal: acquisition } : {}) } });
    await tx.financialAuditLog.create({ data: { action: "ASSET_VALUATION_REVERSED", entityType: input.kind === "DEPRECIATION" ? "AssetValueHistory" : "AssetValueAdjustment", entityId: record.id, authorUsuarioId: context.actor.usuarioId, authorEmployeeId: context.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: context.budgetUnitId, originalTransactionId: original.id, reversalTransactionId: reversal.id, restoredValue: record.openingValueDecimal.toFixed(2), reason: input.reason.trim() } } });
    return reversal;
  }, { timeout: 60000 });
}
