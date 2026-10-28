import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { financialYears } from "../../schema/finance-years";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { creditors } from "../../schema/finance-identity";
import { planningBudgetUnits } from "../../schema/planning-budget";
import { planningExpenseNatures, planningResourceSources } from "../../schema/planning-legal";
import { paymentRetentions } from "../../schema/finance-payments";
import { findFinanceSettlement } from "./settlements";
import { findFinancePayment } from "./payments";
import { findFinanceBankAccount } from "./treasury";

export async function listPrintFinancialYears(db: DatabaseExecutor, filter: { id?: string | null; year: number; governmentEntityId?: string | null }) {
  return db.select({ id: financialYears.id, year: financialYears.year }).from(financialYears).where(filter.id ? eq(financialYears.id, filter.id) : and(eq(financialYears.year, filter.year), filter.governmentEntityId ? eq(financialYears.governmentEntityId, filter.governmentEntityId) : undefined)).limit(2);
}
export async function readPrintableCommitment(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ commitment: commitments, appropriation: budgetAppropriations, creditor: creditors, budgetUnit: { id: planningBudgetUnits.id, code: planningBudgetUnits.code, name: planningBudgetUnits.name }, expenseNature: { code: planningExpenseNatures.code, name: planningExpenseNatures.name }, resourceSource: { code: planningResourceSources.code, name: planningResourceSources.name } }).from(commitments).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, budgetAppropriations.budgetUnitId)).innerJoin(planningExpenseNatures, eq(planningExpenseNatures.id, budgetAppropriations.expenseNatureId)).innerJoin(planningResourceSources, eq(planningResourceSources.id, budgetAppropriations.resourceSourceId)).leftJoin(creditors, eq(creditors.id, commitments.creditorId)).where(eq(commitments.id, id));
  return row ? { ...row.commitment, creditor: row.creditor, appropriation: { ...row.appropriation, budgetUnit: row.budgetUnit, expenseNature: row.expenseNature, resourceSource: row.resourceSource } } : null;
}
export async function readPrintableSettlement(db: DatabaseExecutor, id: string) {
  const settlement = await findFinanceSettlement(db, id);
  if (!settlement) return null;
  const commitment = await readPrintableCommitment(db, settlement.commitmentId);
  if (!commitment) throw new Error("Empenho da liquidação não encontrado.");
  return { ...settlement, commitment };
}
export async function readPrintablePayment(db: DatabaseExecutor, id: string) {
  const payment = await findFinancePayment(db, id);
  if (!payment) return null;
  const [commitment, bankAccount, settlement] = await Promise.all([readPrintableCommitment(db, payment.commitmentId), findFinanceBankAccount(db, payment.bankAccountId), payment.settlementId ? readPrintableSettlement(db, payment.settlementId) : null]);
  if (!commitment || !bankAccount) throw new Error("Origem ou conta do pagamento não encontrada.");
  return { ...payment, commitment, bankAccount, settlement };
}
export async function readPrintableRetention(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(paymentRetentions).where(eq(paymentRetentions.id, id));
  if (!row) return null;
  const payment = await readPrintablePayment(db, row.paymentId);
  return { ...row, payment };
}
