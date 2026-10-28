import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { bankStatementItems } from "../../schema/finance-banking";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { bankClassificationRules } from "../../schema/finance-automation";
import { investmentAllocations, yieldTransactions } from "../../schema/finance-investments";

export async function findInvestmentBank(db: DatabaseExecutor, filter: { id?: string; accountNumber?: string; bankName?: string; agency?: string; linkedInvestmentAccountId?: string; active?: boolean }) {
  const [row] = await db.select().from(reconciliationBankAccounts).where(and(filter.id === undefined ? undefined : eq(reconciliationBankAccounts.id, filter.id), filter.accountNumber === undefined ? undefined : eq(reconciliationBankAccounts.accountNumber, filter.accountNumber), filter.bankName === undefined ? undefined : eq(reconciliationBankAccounts.bankName, filter.bankName), filter.agency === undefined ? undefined : eq(reconciliationBankAccounts.agency, filter.agency), filter.linkedInvestmentAccountId === undefined ? undefined : eq(reconciliationBankAccounts.linkedInvestmentAccountId, filter.linkedInvestmentAccountId), filter.active === undefined ? undefined : eq(reconciliationBankAccounts.isActive, filter.active))).limit(1);
  return row ?? null;
}
export async function findInvestmentStatement(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(bankStatementItems).where(eq(bankStatementItems.id, id));
  return row ?? null;
}
export async function updateInvestmentStatement(tx: DatabaseTransaction, id: string, input: Partial<typeof bankStatementItems.$inferInsert>) {
  const [row] = await tx.update(bankStatementItems).set(input).where(eq(bankStatementItems.id, id)).returning();
  if (!row) throw new Error("Lançamento bancário não encontrado.");
  return row;
}
export async function findInvestmentMovement(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ movement: reconciliationTreasuryMovements, bankAccount: reconciliationBankAccounts }).from(reconciliationTreasuryMovements).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, reconciliationTreasuryMovements.bankAccountId)).where(eq(reconciliationTreasuryMovements.id, id));
  return row ? { ...row.movement, bankAccount: row.bankAccount } : null;
}
export async function listInvestmentClassificationRules(db: DatabaseExecutor) {
  return db.select().from(bankClassificationRules).where(and(eq(bankClassificationRules.ativo, true), ne(bankClassificationRules.tipoMovimento, "RECEITA_CONSTITUCIONAL"))).orderBy(asc(bankClassificationRules.prioridade));
}
export async function findInvestmentRevenueNature(db: DatabaseExecutor) {
  const [row] = (await db.execute<{ id: string }>(sql`SELECT id FROM "RevenueNature" WHERE code LIKE ${"1.3.2.1%"} ORDER BY code LIMIT 1`)).rows;
  return row ?? null;
}
export async function findInvestmentYield(db: DatabaseExecutor, key: string) {
  const [row] = await db.select().from(yieldTransactions).where(eq(yieldTransactions.idempotencyKey, key));
  return row ?? null;
}
export async function insertInvestmentYield(tx: DatabaseTransaction, input: typeof yieldTransactions.$inferInsert) {
  const [row] = await tx.insert(yieldTransactions).values(input).returning();
  return row;
}
export async function updateInvestmentYieldReceipt(tx: DatabaseTransaction, id: string, receipt: { reciboMunicipal: string; lancamentoContabilId: string }) {
  await tx.update(yieldTransactions).set(receipt).where(eq(yieldTransactions.id, id));
}
export async function ensureInvestmentAllocation(tx: DatabaseTransaction, input: typeof investmentAllocations.$inferInsert) {
  await tx.insert(investmentAllocations).values(input).onConflictDoNothing({ target: investmentAllocations.treasuryTransferId });
}
export async function listInvestmentStatements(db: DatabaseExecutor, bank: string, limit: number) {
  return db.select().from(bankStatementItems).where(eq(bankStatementItems.banco, bank)).orderBy(desc(bankStatementItems.date)).limit(limit);
}
export async function listInvestmentYieldHistory(db: DatabaseExecutor, accounts: string[], limit: number) {
  if (!accounts.length) return [];
  return db.select().from(yieldTransactions).where(inArray(yieldTransactions.contaNumero, accounts)).orderBy(desc(yieldTransactions.createdAt)).limit(limit);
}
export async function listInvestmentStatementReferences(db: DatabaseExecutor, input: { bank: string; agency: string; account: string; references: string[] }) {
  if (!input.references.length) return [];
  return db.select({ id: bankStatementItems.id, codigoTransacao: bankStatementItems.codigoTransacao, treasuryMovementId: bankStatementItems.treasuryMovementId }).from(bankStatementItems).where(and(eq(bankStatementItems.banco, input.bank), eq(bankStatementItems.agencia, input.agency), eq(bankStatementItems.contaNumero, input.account), inArray(bankStatementItems.codigoTransacao, input.references)));
}
