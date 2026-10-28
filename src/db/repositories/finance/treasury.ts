import { and, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { accountingEntries, accountingTransactions } from "../../schema/finance-accounting";

export async function findFinanceBankAccount(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, id));
  return row ?? null;
}
export async function listConfirmedTreasuryMovements(db: DatabaseExecutor, filter: { bankAccountId?: string; bankAccountIds?: string[]; through?: Date }) {
  return db.select().from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.status, "Confirmado"), filter.bankAccountId === undefined ? undefined : eq(reconciliationTreasuryMovements.bankAccountId, filter.bankAccountId), filter.bankAccountIds === undefined ? undefined : inArray(reconciliationTreasuryMovements.bankAccountId, filter.bankAccountIds), filter.through ? lte(reconciliationTreasuryMovements.date, filter.through) : undefined));
}
export async function hasDuplicateBankLedger(db: DatabaseExecutor, id: string, accountingPlanId: string, budgetUnitId: string): Promise<boolean> {
  const [row] = await db.select({ id: reconciliationBankAccounts.id }).from(reconciliationBankAccounts).where(and(ne(reconciliationBankAccounts.id, id), eq(reconciliationBankAccounts.accountingPlanId, accountingPlanId), eq(reconciliationBankAccounts.budgetUnitId, budgetUnitId))).limit(1);
  return !!row;
}
export async function listBankLedgerEntries(db: DatabaseExecutor, accountingPlanId: string, budgetUnitId: string | null, through?: Date) {
  return db.select({ type: accountingEntries.type, value: accountingEntries.value, valueDecimal: accountingEntries.valueDecimal }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(eq(accountingEntries.accountId, accountingPlanId), eq(accountingTransactions.status, "POSTADO"), budgetUnitId === null ? isNull(accountingTransactions.budgetUnitId) : eq(accountingTransactions.budgetUnitId, budgetUnitId), through ? lte(accountingTransactions.date, through) : undefined));
}
export async function insertTreasuryMovement(tx: DatabaseTransaction, input: typeof reconciliationTreasuryMovements.$inferInsert) {
  const [row] = await tx.insert(reconciliationTreasuryMovements).values(input).returning();
  return row;
}
