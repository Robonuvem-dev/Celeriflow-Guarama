import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { findCostPayrollIntegration, listCostSourcesByEvidence, readCostSettlement } from "@/db/repositories/finance/cost-origins";
import { cancelMunicipalCostSource, recordMunicipalCostSource, municipalCostSourceCeiling, MunicipalCostError } from "./cost-ledger";
import type { CostActor } from "./cost-types";
import { recordPayrollSettlementCosts } from "./cost-payroll-bridge";

export async function recordSettlementMunicipalCosts(tx: DatabaseTransaction, actor: CostActor, settlementId: string) {
  const settlement = await readCostSettlement(tx, settlementId);
  const expense = settlement.commitment.reservation?.expense;
  // Adiantamento é direito a prestar contas; VPD e custo nascem na prestação.
  if (expense?.sourceModule === "RH" && expense.sourceType === "ADVANCE_ALLOWANCE") return;
  if (!settlement.valueDecimal) return;
  const appropriation = settlement.commitment.appropriation;
  // Recebimento de materiais permanece em estoque; investimentos são ativos,
  // não custo de serviço. Apropriação ocorre no consumo/depreciação canônicos.
  const nature = appropriation.expenseNature.code.replace(/\D/g, "");
  if (settlement.commitment.purchaseReceiptId || nature.startsWith("4") || nature.startsWith("339030")) return;
  const release = expense?.sourceModule === "RH" ? await findCostPayrollIntegration(tx, `CONTABIL:PROVISAO:BAIXA:${settlement.id}`) : null;
  const releaseMemory = release?.status === "CONCLUIDA" && release.payload && typeof release.payload === "object" && !Array.isArray(release.payload) ? release.payload.rows : null;
  const released = Array.isArray(releaseMemory) ? releaseMemory.reduce<Decimal>((sum, row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.amount !== "string") throw new Error("Baixa de provisão sem memória Decimal conciliada.");
    return sum.plus(row.amount);
  }, new Decimal(0)) : new Decimal(0);
  const amount = settlement.valueDecimal.minus(released);
  if (amount.lt(0)) throw new Error("Provisões baixadas excedem a liquidação.");
  if (amount.isZero()) return;
  if (expense?.sourceModule === "RH" && expense.sourceType === "PAYROLL_RUN") {
    await recordPayrollSettlementCosts(tx, actor, { settlementId, netAmount: amount, releaseMemory, releaseEventId: release?.id ?? null });
    return;
  }
  const sourceType = "SETTLEMENT";
  await recordMunicipalCostSource(tx, actor, { financialYearId: settlement.executionFinancialYearId ?? appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId, sourceType, sourceId: settlement.id, expenseDate: settlement.date, amount, dimensions: { appropriationId: appropriation.id, ...(settlement.commitment.contractId ? { contractId: settlement.commitment.contractId } : {}) }, evidence: { settlementId: settlement.id, commitmentId: settlement.commitmentId, documentId: settlement.documentId, expenseId: expense?.id ?? null, originType: expense?.sourceType ?? null, originId: expense?.sourceId ?? null, settledAmount: settlement.valueDecimal.toFixed(2), provisionReleaseAmount: released.toFixed(2), provisionReleaseEventId: release?.id ?? null } });
}

export async function cancelSettlementMunicipalCosts(tx: DatabaseTransaction, actor: CostActor, settlementId: string) {
  await tx.execute(sql`SELECT id FROM "Settlement" WHERE id=${settlementId} FOR UPDATE`);
  const consumed = await listCostSourcesByEvidence(tx, ["STOCK_CONSUMPTION", "IMMEDIATE_MATERIAL"], "settlementId", settlementId, true);
  for (const source of consumed) {
    if ((await municipalCostSourceCeiling(tx, source)).gt(0)) throw new MunicipalCostError("Devolva/estorne o consumo de material vinculado antes de cancelar a liquidação; a prova financeira não pode desaparecer com consumo remanescente.");
    await cancelMunicipalCostSource(tx, actor, source.sourceType === "IMMEDIATE_MATERIAL" ? "IMMEDIATE_MATERIAL" : "STOCK_CONSUMPTION", source.sourceId);
  }
  for (const type of ["SETTLEMENT", "PAYROLL"] as const) await cancelMunicipalCostSource(tx, actor, type, settlementId);
  const payroll = await listCostSourcesByEvidence(tx, ["PAYROLL"], "settlementId", settlementId);
  for (const source of payroll) await cancelMunicipalCostSource(tx, actor, "PAYROLL", source.sourceId);
}
