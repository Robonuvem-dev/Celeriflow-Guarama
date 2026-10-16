import { Prisma } from "@prisma/client";
import { FinanceError, assertAccountingPeriodOpen, postAccountingEventInTransaction, type FinanceActor } from "@/lib/financeiro";

export type AssetValuationContext = { actor: FinanceActor; budgetUnitId: string };

export async function resolveAssetValuationScope(tx: Prisma.TransactionClient, context: AssetValuationContext, date: Date) {
  if (!context.budgetUnitId.trim() || !Number.isFinite(date.valueOf())) throw new FinanceError("Informe UG e data válidas para a operação patrimonial.");
  if (context.actor.allowedBudgetUnitIds && !context.actor.allowedBudgetUnitIds.includes(context.budgetUnitId)) throw new FinanceError("Operação patrimonial fora das unidades gestoras autorizadas.");
  const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: context.budgetUnitId }, include: { planningEntityUnit: true } });
  if (!unit.planningEntityUnit || !unit.secretariatId) throw new FinanceError("A UG patrimonial exige ente e lotação administrativa conciliados.");
  const years = await tx.financialYear.findMany({ where: { governmentEntityId: unit.planningEntityUnit.governmentEntityId, status: "Aberto", startDate: { lte: date }, endDate: { gte: date } } });
  if (years.length !== 1) throw new FinanceError("Operação patrimonial exige exercício aberto único do ente.");
  await assertAccountingPeriodOpen(tx, years[0].id, date);
  return { unit, financialYearId: years[0].id, governmentEntityId: unit.planningEntityUnit.governmentEntityId };
}

export async function assertAssetValuationOrigin(tx: Prisma.TransactionClient, assetId: string, context: AssetValuationContext, secretariatId: string) {
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { budgetUnitId: true, department: { select: { secretariatId: true } }, purchaseReceiptItem: { select: { purchaseReceipt: { select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } } } } } });
  if (asset.budgetUnitId && asset.budgetUnitId !== context.budgetUnitId) throw new FinanceError("Bem pertence a outra UG patrimonial.");
  if (asset.department?.secretariatId !== secretariatId) throw new FinanceError("Bem sem lotação conciliada com a UG selecionada.");
  if (asset.purchaseReceiptItem && asset.purchaseReceiptItem.purchaseReceipt.commitment?.appropriation.budgetUnitId !== context.budgetUnitId) throw new FinanceError("UG patrimonial diverge do empenho original do tombamento.");
  if (!asset.purchaseReceiptItem && !asset.budgetUnitId) {
    const prior = await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION", sourceId: assetId, budgetUnitId: context.budgetUnitId }, select: { id: true } });
    if (!prior && await tx.budgetUnit.count({ where: { secretariatId, planningEntityUnit: { isNot: null } } }) !== 1) throw new FinanceError("Bem legado com lotação compartilhada por UGs exige conciliação individual da origem patrimonial.");
  }
  const otherScope = await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION", sourceId: assetId, OR: [{ budgetUnitId: { not: context.budgetUnitId } }, { budgetUnitId: null }] }, select: { id: true } });
  if (otherScope) throw new FinanceError("Bem possui fatos contábeis em outra UG ou sem escopo; concilie sua transferência antes da operação.");
}

export async function postAssetValuation(tx: Prisma.TransactionClient, context: AssetValuationContext, input: { assetId: string; date: Date; eventCode: string; value: Prisma.Decimal; key: string; history: string }) {
  const scope = await resolveAssetValuationScope(tx, context, input.date);
  await assertAssetValuationOrigin(tx, input.assetId, context, scope.unit.secretariatId!);
  const later = await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: { in: ["ASSET_VALUATION", "ASSET_VALUATION_REVERSAL"] }, sourceId: input.assetId, date: { gt: input.date }, status: "POSTADO" }, select: { id: true } });
  if (later) throw new FinanceError("Há fato ou estorno patrimonial posterior; preserve a sequência da escrituração.");
  return postAccountingEventInTransaction(tx, context.actor, { financialYearId: scope.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: context.budgetUnitId, date: input.date, eventCode: input.eventCode, value: input.value, history: input.history, sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION", sourceId: input.assetId, idempotencyKey: input.key });
}
