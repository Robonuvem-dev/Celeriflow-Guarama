import { sql } from "drizzle-orm";
import type { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import { FinanceError, assertAccountingPeriodOpen, postAccountingEventInTransaction, type FinanceActor } from "@/lib/financeiro";

export type AssetValuationContext = { actor: FinanceActor; budgetUnitId: string };

export async function resolveAssetValuationScope(tx: DatabaseTransaction, context: AssetValuationContext, date: Date) {
  if (!context.budgetUnitId.trim() || !Number.isFinite(date.valueOf())) throw new FinanceError("Informe UG e data válidas para a operação patrimonial.");
  if (context.actor.allowedBudgetUnitIds && !context.actor.allowedBudgetUnitIds.includes(context.budgetUnitId)) throw new FinanceError("Operação patrimonial fora das unidades gestoras autorizadas.");
  const binding = (await tx.execute<{ id: string; secretariatId: string | null; governmentEntityId: string | null }>(sql`SELECT u.id, u."secretariatId", p."governmentEntityId" FROM "BudgetUnit" u LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id WHERE u.id=${context.budgetUnitId}`)).rows[0];
  if (!binding?.governmentEntityId || !binding.secretariatId) throw new FinanceError("A UG patrimonial exige ente e lotação administrativa conciliados.");
  const unit = { id: binding.id, secretariatId: binding.secretariatId, planningEntityUnit: { governmentEntityId: binding.governmentEntityId } };
  const years = (await tx.execute<{ id: string }>(sql`SELECT id FROM "FinancialYear" WHERE "governmentEntityId"=${unit.planningEntityUnit.governmentEntityId} AND status='Aberto' AND "startDate"<=${date} AND "endDate">=${date}`)).rows;
  if (years.length !== 1) throw new FinanceError("Operação patrimonial exige exercício aberto único do ente.");
  await assertAccountingPeriodOpen(tx, years[0].id, date);
  return { unit, financialYearId: years[0].id, governmentEntityId: unit.planningEntityUnit.governmentEntityId };
}

export async function assertAssetValuationOrigin(tx: DatabaseTransaction, assetId: string, context: AssetValuationContext, secretariatId: string) {
  const asset = (await tx.execute<{ budgetUnitId: string | null; secretariatId: string | null; purchaseReceiptItemId: string | null; originBudgetUnitId: string | null }>(sql`SELECT a."budgetUnitId", d."secretariatId", i.id AS "purchaseReceiptItemId", b."budgetUnitId" AS "originBudgetUnitId" FROM "Asset" a LEFT JOIN "Department" d ON d.id=a."departmentId" LEFT JOIN "PurchaseReceiptItem" i ON i.id=a."purchaseReceiptItemId" LEFT JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" LEFT JOIN "Commitment" c ON c."purchaseReceiptId"=r.id LEFT JOIN "BudgetAppropriation" b ON b.id=c."appropriationId" WHERE a.id=${assetId}`)).rows[0];
  if (!asset) throw new FinanceError("Bem patrimonial não encontrado.");
  if (asset.budgetUnitId && asset.budgetUnitId !== context.budgetUnitId) throw new FinanceError("Bem pertence a outra UG patrimonial.");
  if (asset.secretariatId !== secretariatId) throw new FinanceError("Bem sem lotação conciliada com a UG selecionada.");
  if (asset.purchaseReceiptItemId && asset.originBudgetUnitId !== context.budgetUnitId) throw new FinanceError("UG patrimonial diverge do empenho original do tombamento.");
  if (!asset.purchaseReceiptItemId && !asset.budgetUnitId) {
    const prior = (await tx.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceModule"='PATRIMONIO' AND "sourceType"='ASSET_VALUATION' AND "sourceId"=${assetId} AND "budgetUnitId"=${context.budgetUnitId} LIMIT 1`)).rows[0];
    const units = await tx.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "BudgetUnit" u WHERE u."secretariatId"=${secretariatId} AND EXISTS (SELECT 1 FROM "PlanningEntityUnit" p WHERE p."budgetUnitId"=u.id)`);
    if (!prior && units.rows[0].count !== 1) throw new FinanceError("Bem legado com lotação compartilhada por UGs exige conciliação individual da origem patrimonial.");
  }
  const otherScope = (await tx.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceModule"='PATRIMONIO' AND "sourceType"='ASSET_VALUATION' AND "sourceId"=${assetId} AND ("budgetUnitId"<>${context.budgetUnitId} OR "budgetUnitId" IS NULL) LIMIT 1`)).rows[0];
  if (otherScope) throw new FinanceError("Bem possui fatos contábeis em outra UG ou sem escopo; concilie sua transferência antes da operação.");
}

export async function postAssetValuation(tx: DatabaseTransaction, context: AssetValuationContext, input: { assetId: string; date: Date; eventCode: string; value: Decimal; key: string; history: string }) {
  const scope = await resolveAssetValuationScope(tx, context, input.date);
  await assertAssetValuationOrigin(tx, input.assetId, context, scope.unit.secretariatId!);
  const later = (await tx.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceModule"='PATRIMONIO' AND "sourceType" IN ('ASSET_VALUATION','ASSET_VALUATION_REVERSAL') AND "sourceId"=${input.assetId} AND date>${input.date} AND status='POSTADO' LIMIT 1`)).rows[0];
  if (later) throw new FinanceError("Há fato ou estorno patrimonial posterior; preserve a sequência da escrituração.");
  return postAccountingEventInTransaction(tx, context.actor, { financialYearId: scope.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: context.budgetUnitId, date: input.date, eventCode: input.eventCode, value: input.value, history: input.history, sourceModule: "PATRIMONIO", sourceType: "ASSET_VALUATION", sourceId: input.assetId, idempotencyKey: input.key });
}
