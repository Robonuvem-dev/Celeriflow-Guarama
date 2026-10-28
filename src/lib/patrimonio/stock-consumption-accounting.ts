import { eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import type { DatabaseTransaction } from "@/db/transaction";
import { materialStocks, materialStockValuations } from "@/db/schema/assets-stock";
import type { MaterialMovementRecord } from "@/lib/contracts/assets-stock";
import { postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { StockValuationError } from "./stock-valuation";
import type { StockActor } from "./stock-service";

/** Only a documented budgetary consumption is a VPD, never a transfer or tombamento. */
export async function postStockConsumptionAccounting(tx: DatabaseTransaction, actor: StockActor, movement: MaterialMovementRecord) {
  const [valuation] = movement.stockId ? await tx.select({ valuationEnabled: materialStocks.valuationEnabled, position: materialStockValuations }).from(materialStocks)
    .leftJoin(materialStockValuations, eq(materialStockValuations.stockId, materialStocks.id)).where(eq(materialStocks.id, movement.stockId)).limit(1) : [];
  if (!valuation?.valuationEnabled || !valuation.position) return;
  const position = valuation.position;
  const reason = movement.reason?.split(":")[0];
  const regular = movement.type === "Saída" && movement.operation === "REGULAR" && movement.settlementId && ["CONSUMO_ORCAMENTARIO", "CONSUMO_ORCAMENTARIO_DIRETO"].includes(reason ?? "");
  const originId = movement.returnedMovementId || movement.reversedMovementId;
  const original = originId ? (await tx.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceModule"='PATRIMONIO' AND "sourceType"='STOCK_CONSUMPTION' AND "sourceId"=${originId} AND "eventType"='STOCK_CONSUMED' LIMIT 1`)).rows[0] : null;
  if (!regular && !original) return;
  if (!movement.totalValueDecimal || movement.totalValueDecimal.isZero()) return;
  if (!actor.employeeId) throw new StockValuationError("Consumo contabilizado exige usuário vinculado a servidor.");
  if (regular) {
    await tx.execute(sql`SELECT id FROM "Settlement" WHERE id=${movement.settlementId!} FOR UPDATE`);
    const rawSettlement = (await tx.execute<{ id: string; status: string; date: string; budgetUnitId: string; governmentEntityId: string | null; natureCode: string; expenseSourceType: string | null; purchaseReceiptId: string | null; materialType: string }>(sql`
      SELECT s.id, s.status, s.date, a."budgetUnitId", y."governmentEntityId", n.code AS "natureCode", e."sourceType" AS "expenseSourceType", c."purchaseReceiptId", m.type AS "materialType"
      FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId"
      JOIN "FinancialYear" y ON y.id=a."financialYearId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
      LEFT JOIN "BudgetReservation" r ON r.id=c."reservationId" LEFT JOIN "Expense" e ON e.id=r."expenseId"
       JOIN "Material" m ON m.id=${movement.materialId} WHERE s.id=${movement.settlementId!}`)).rows[0];
    const settlement = rawSettlement ? { ...rawSettlement, date: databaseTimestamp(rawSettlement.date) } : null;
    if (!settlement || settlement.status !== "Liquidado" || settlement.budgetUnitId !== position.budgetUnitId || settlement.governmentEntityId !== position.governmentEntityId) throw new StockValuationError("Consumo exige liquidação ativa no mesmo ente/UG da valorização.");
    const nature = settlement.natureCode.replace(/\D/g, "");
    if (settlement.materialType === "PATRIMONIO" || nature.startsWith("4") || settlement.expenseSourceType === "ADVANCE_ALLOWANCE" || movement.date < settlement.date) throw new StockValuationError("Consumo não pode antecipar a liquidação nem substituir investimento, tombamento ou adiantamento.");
    if (settlement.purchaseReceiptId) {
      const proof = await tx.execute<{ id: string }>(sql`SELECT i.id FROM "PurchaseReceiptItem" i JOIN "MaterialMovement" m ON m.id=i."stockMovementId" WHERE i."purchaseReceiptId"=${settlement.purchaseReceiptId} AND i."materialId"=${movement.materialId} AND i."warehouseId"=${movement.warehouseId} AND m."stockId" IS NOT DISTINCT FROM ${movement.stockId} LIMIT 1`);
      if (!proof.rows.length) throw new StockValuationError("Consumo não pertence ao material/lote recebido pela liquidação.");
    } else if (!nature.startsWith("339030")) throw new StockValuationError("Liquidação sem recebimento deve identificar material de consumo.");
    const entries = (await tx.execute<{ type: string; valueDecimal: string | null }>(sql`SELECT e.type, e."valueDecimal" FROM "AccountingEntry" e JOIN "AccountingTransaction" t ON t.id=e."transactionId" WHERE e."accountId"=${position.inventoryAccountId} AND t."sourceModule"='FINANCEIRO' AND t."sourceType"='SETTLEMENT' AND t."sourceId"=${settlement.id} AND t."eventType"='LIQUIDACAO_REGISTRADA'`)).rows;
    if (!entries.length || entries.some(entry => !entry.valueDecimal)) throw new StockValuationError("Liquidação deve comprovar reconhecimento Decimal do ativo de estoque, sem VPD antecipada.");
    if ((await tx.execute<{ id: string }>(sql`SELECT e.id FROM "AccountingEntry" e JOIN "AccountingPlan" a ON a.id=e."accountId" JOIN "AccountingTransaction" t ON t.id=e."transactionId" WHERE e.type='Débito' AND left(a.code,1)='3' AND t."sourceModule"='FINANCEIRO' AND t."sourceType"='SETTLEMENT' AND t."sourceId"=${settlement.id} AND t."eventType"='LIQUIDACAO_REGISTRADA' LIMIT 1`)).rows.length) throw new StockValuationError("Liquidação possui VPD antecipada; reconcilie a composição antes de reconhecer novamente o consumo.");
    const recognized = entries.reduce((sum, entry) => sum.plus(new Decimal(entry.valueDecimal!).mul(entry.type === "Débito" ? 1 : -1)), new Decimal(0));
    const issues = (await tx.execute<{ totalValueDecimal: string | null; returns: string; reversal: string | null }>(sql`SELECT m."totalValueDecimal", COALESCE((SELECT sum(r."totalValueDecimal") FROM "MaterialMovement" r WHERE r."returnedMovementId"=m.id),0)::text AS returns, (SELECT r."totalValueDecimal"::text FROM "MaterialMovement" r WHERE r."reversedMovementId"=m.id) AS reversal FROM "MaterialMovement" m WHERE m."settlementId"=${settlement.id} AND m.operation='REGULAR' AND m.type='Saída' AND starts_with(m.reason,'CONSUMO_ORCAMENTARIO')`)).rows;
    const consumed = issues.reduce((sum, issue) => sum.plus(issue.totalValueDecimal ?? 0).minus(issue.returns).minus(issue.reversal ?? 0), new Decimal(0));
    if (consumed.gt(recognized)) throw new StockValuationError("Consumo líquido excede o ativo reconhecido pela liquidação.");
  }
  const years = (await tx.execute<{ id: string }>(sql`SELECT id FROM "FinancialYear" WHERE "governmentEntityId"=${position.governmentEntityId} AND year=${movement.date.getUTCFullYear()}`)).rows;
  if (years.length !== 1) throw new StockValuationError("Consumo/devolução exige exercício inequívoco da entidade na data do movimento.");
  return postAccountingTransactionInTransaction(tx, { ...actor, employeeId: actor.employeeId, budgetUnitId: position.budgetUnitId, allowedBudgetUnitIds: actor.allowedBudgetUnitIds ?? [position.budgetUnitId] }, {
    financialYearId: years[0].id, governmentEntityId: position.governmentEntityId, budgetUnitId: position.budgetUnitId,
    date: movement.date, history: `${regular ? "Consumo valorizado" : "Devolução/estorno de consumo"} · ${movement.id}`,
    sourceModule: "PATRIMONIO", sourceType: "STOCK_CONSUMPTION", sourceId: movement.id,
    eventType: regular ? "STOCK_CONSUMED" : "STOCK_CONSUMPTION_RETURNED", idempotencyKey: `STOCK_VPD:${movement.id}`,
    lines: [
      { accountId: position.consumptionAccountId, type: regular ? "Débito" : "Crédito", value: movement.totalValueDecimal },
      { accountId: position.inventoryAccountId, type: regular ? "Crédito" : "Débito", value: movement.totalValueDecimal },
    ],
  });
}
