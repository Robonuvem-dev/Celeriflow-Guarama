import { and, asc, desc, eq, gte, lt, lte, notExists, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { reconciliationBankAccounts, reconciliationTreasuryMovements, bankReconciliations } from "../../schema/finance-reconciliation";
import { bankStatementImports, bankStatementItems } from "../../schema/finance-banking";
import { treasuryTransfers } from "../../schema/finance-revenues";
import { accountingEntries, accountingPlans } from "../../schema/finance-accounting";
import { banks, bankBranches } from "../../schema/master-data";
import { PersistenceError } from "../../errors";

export async function findBankAccountingPlan(db: DatabaseExecutor, filter: { id: string } | { code: string }) {
  const [row] = await db.select({ id: accountingPlans.id }).from(accountingPlans).where("id" in filter ? eq(accountingPlans.id, filter.id) : eq(accountingPlans.code, filter.code));
  return row ?? null;
}
export async function findActiveFinanceBank(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ id: banks.id, name: banks.name }).from(banks).where(and(eq(banks.id, id), eq(banks.status, "ATIVO")));
  return row ?? null;
}
export async function findActiveFinanceBankBranch(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ id: bankBranches.id, bankId: bankBranches.bankId, code: bankBranches.code }).from(bankBranches).where(and(eq(bankBranches.id, id), eq(bankBranches.status, "ATIVA")));
  return row ?? null;
}
export async function hasBankMovements(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ id: reconciliationTreasuryMovements.id }).from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.bankAccountId, id)).limit(1);
  return !!row;
}
export async function hasBankAccountPostings(db: DatabaseExecutor, accountId: string) {
  const [row] = await db.select({ id: accountingEntries.id }).from(accountingEntries).where(eq(accountingEntries.accountId, accountId)).limit(1);
  return !!row;
}
export async function insertFinanceBankAccount(tx: DatabaseTransaction, input: typeof reconciliationBankAccounts.$inferInsert) {
  const [row] = await tx.insert(reconciliationBankAccounts).values(input).returning();
  return row;
}
export async function updateFinanceBankAccount(tx: DatabaseTransaction, id: string, input: Partial<typeof reconciliationBankAccounts.$inferInsert>) {
  const [row] = await tx.update(reconciliationBankAccounts).set(input).where(eq(reconciliationBankAccounts.id, id)).returning();
  if (!row) throw new PersistenceError("not-found", "Conta bancária não encontrada.");
  return row;
}
export async function findTreasuryTransferReplay(db: DatabaseExecutor, key: string) {
  const [row] = await db.select({ transfer: treasuryTransfers, sourceMovement: reconciliationTreasuryMovements }).from(treasuryTransfers).innerJoin(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.id, treasuryTransfers.sourceMovementId)).where(eq(treasuryTransfers.idempotencyKey, key));
  return row ? { ...row.transfer, sourceMovement: row.sourceMovement } : null;
}
export async function insertTreasuryTransfer(tx: DatabaseTransaction, input: typeof treasuryTransfers.$inferInsert) {
  const [row] = await tx.insert(treasuryTransfers).values(input).returning();
  return row;
}
export async function listTreasuryPeriodMovements(db: DatabaseExecutor, filter: { bankAccountId?: string; resourceSourceId?: string; start?: Date; end?: Date; before?: Date }) {
  return db.select().from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.status, "Confirmado"), filter.bankAccountId === undefined ? undefined : eq(reconciliationTreasuryMovements.bankAccountId, filter.bankAccountId), filter.resourceSourceId === undefined ? undefined : eq(reconciliationTreasuryMovements.resourceSourceId, filter.resourceSourceId), filter.start ? gte(reconciliationTreasuryMovements.date, filter.start) : undefined, filter.end ? lte(reconciliationTreasuryMovements.date, filter.end) : undefined, filter.before ? lt(reconciliationTreasuryMovements.date, filter.before) : undefined)).orderBy(asc(reconciliationTreasuryMovements.date), asc(reconciliationTreasuryMovements.id));
}
export async function findConfirmedReconciliation(db: DatabaseExecutor, bankAccountId: string, through: Date) {
  const [row] = await db.select().from(bankReconciliations).where(and(eq(bankReconciliations.bankAccountId, bankAccountId), eq(bankReconciliations.status, "Conciliado"), lte(bankReconciliations.periodEnd, through))).orderBy(desc(bankReconciliations.periodEnd)).limit(1);
  return row ?? null;
}
export async function listPendingReconciliationStatements(db: DatabaseExecutor, bankAccountId: string, through: Date) {
  const rows = await db.select({ item: bankStatementItems }).from(bankStatementItems).innerJoin(bankStatementImports, eq(bankStatementImports.id, bankStatementItems.statementImportId)).where(and(eq(bankStatementImports.bankAccountId, bankAccountId), eq(bankStatementItems.status, "Pendente"), lte(bankStatementItems.date, through)));
  return rows.map(row => row.item);
}
export async function listUnlinkedReconciliationMovements(db: DatabaseExecutor, bankAccountId: string, through: Date) {
  const linked = db.select({ id: bankStatementItems.id }).from(bankStatementItems).where(eq(bankStatementItems.treasuryMovementId, reconciliationTreasuryMovements.id));
  return db.select().from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.bankAccountId, bankAccountId), eq(reconciliationTreasuryMovements.status, "Confirmado"), lte(reconciliationTreasuryMovements.date, through), notExists(linked)));
}
export async function lockBankPlanningAssignments(tx: DatabaseTransaction, previousUnit: string | null, nextUnit: string | null) {
  const [runtime] = (await tx.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningEntityUnit"') IS NOT NULL AS ready`)).rows;
  if (runtime?.ready) await tx.execute(sql`SELECT p.id FROM "PlanningInstrument" p JOIN "PlanningEntityUnit" u ON u."governmentEntityId"=p."governmentEntityId" WHERE u."budgetUnitId"=${previousUnit} OR u."budgetUnitId"=${nextUnit} ORDER BY p.id FOR UPDATE OF p`);
}
