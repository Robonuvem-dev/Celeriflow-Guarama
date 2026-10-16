import { Prisma, type MaterialMovement } from "@prisma/client";
import { postAccountingTransactionInTransaction } from "@/lib/financeiro";
import { StockValuationError } from "./stock-valuation";
import type { StockActor } from "./stock-service";

/** Only a documented budgetary consumption is a VPD, never a transfer or tombamento. */
export async function postStockConsumptionAccounting(tx: Prisma.TransactionClient, actor: StockActor, movement: MaterialMovement) {
  const valuation = movement.stockId ? await tx.materialStock.findUnique({ where: { id: movement.stockId }, include: { valuation: true } }) : null;
  if (!valuation?.valuationEnabled || !valuation.valuation) return;
  const position = valuation.valuation;
  const reason = movement.reason?.split(":")[0];
  const regular = movement.type === "Saída" && movement.operation === "REGULAR" && movement.settlementId && ["CONSUMO_ORCAMENTARIO", "CONSUMO_ORCAMENTARIO_DIRETO"].includes(reason ?? "");
  const originId = movement.returnedMovementId || movement.reversedMovementId;
  const original = originId ? await tx.accountingTransaction.findFirst({ where: { sourceModule: "PATRIMONIO", sourceType: "STOCK_CONSUMPTION", sourceId: originId, eventType: "STOCK_CONSUMED" } }) : null;
  if (!regular && !original) return;
  if (!movement.totalValueDecimal || movement.totalValueDecimal.isZero()) return;
  if (!actor.employeeId) throw new StockValuationError("Consumo contabilizado exige usuário vinculado a servidor.");
  if (regular) {
    await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id=${movement.settlementId!} FOR UPDATE`;
    const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: movement.settlementId! }, include: { commitment: { include: { appropriation: { include: { financialYear: true, expenseNature: true } }, reservation: { include: { expense: true } } } } } });
    if (settlement.status !== "Liquidado" || settlement.commitment.appropriation.budgetUnitId !== position.budgetUnitId || settlement.commitment.appropriation.financialYear.governmentEntityId !== position.governmentEntityId) throw new StockValuationError("Consumo exige liquidação ativa no mesmo ente/UG da valorização.");
    const material = await tx.material.findUniqueOrThrow({ where: { id: movement.materialId } });
    const nature = settlement.commitment.appropriation.expenseNature.code.replace(/\D/g, "");
    const expense = settlement.commitment.reservation?.expense;
    if (material.type === "PATRIMONIO" || nature.startsWith("4") || expense?.sourceType === "ADVANCE_ALLOWANCE" || movement.date < settlement.date) throw new StockValuationError("Consumo não pode antecipar a liquidação nem substituir investimento, tombamento ou adiantamento.");
    if (settlement.commitment.purchaseReceiptId) {
      if (!await tx.purchaseReceiptItem.count({ where: { purchaseReceiptId: settlement.commitment.purchaseReceiptId, materialId: movement.materialId, warehouseId: movement.warehouseId, stockMovement: { stockId: movement.stockId } } })) throw new StockValuationError("Consumo não pertence ao material/lote recebido pela liquidação.");
    } else if (!nature.startsWith("339030")) throw new StockValuationError("Liquidação sem recebimento deve identificar material de consumo.");
    const entries = await tx.accountingEntry.findMany({ where: { accountId: position.inventoryAccountId, transaction: { sourceModule: "FINANCEIRO", sourceType: "SETTLEMENT", sourceId: settlement.id, eventType: "LIQUIDACAO_REGISTRADA" } } });
    if (!entries.length || entries.some(entry => !entry.valueDecimal)) throw new StockValuationError("Liquidação deve comprovar reconhecimento Decimal do ativo de estoque, sem VPD antecipada.");
    if (await tx.accountingEntry.count({ where: { type: "Débito", account: { code: { startsWith: "3" } }, transaction: { sourceModule: "FINANCEIRO", sourceType: "SETTLEMENT", sourceId: settlement.id, eventType: "LIQUIDACAO_REGISTRADA" } } })) throw new StockValuationError("Liquidação possui VPD antecipada; reconcilie a composição antes de reconhecer novamente o consumo.");
    const recognized = entries.reduce((sum, entry) => sum.plus(entry.valueDecimal!.mul(entry.type === "Débito" ? 1 : -1)), new Prisma.Decimal(0));
    const issues = await tx.materialMovement.findMany({ where: { settlementId: settlement.id, operation: "REGULAR", type: "Saída", reason: { startsWith: "CONSUMO_ORCAMENTARIO" } }, include: { returnMovements: true, reversalMovement: true } });
    const consumed = issues.reduce((sum, issue) => sum.plus(issue.totalValueDecimal ?? 0).minus(issue.returnMovements.reduce((returned, row) => returned.plus(row.totalValueDecimal ?? 0), new Prisma.Decimal(0))).minus(issue.reversalMovement?.totalValueDecimal ?? 0), new Prisma.Decimal(0));
    if (consumed.gt(recognized)) throw new StockValuationError("Consumo líquido excede o ativo reconhecido pela liquidação.");
  }
  const years = await tx.financialYear.findMany({ where: { governmentEntityId: position.governmentEntityId, year: movement.date.getUTCFullYear() } });
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
