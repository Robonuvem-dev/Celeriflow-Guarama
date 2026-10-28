import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { bankClassificationRules, bankExceptionQueueItems } from "../../schema/finance-automation";
import { reconciliationBankAccounts } from "../../schema/finance-reconciliation";
import { bankStatementItems } from "../../schema/finance-banking";
import { planningResourceSources, planningRevenueNatures } from "../../schema/planning-legal";
import { users } from "../../schema/identity";

const bankLabel = { id: reconciliationBankAccounts.id, bankName: reconciliationBankAccounts.bankName, agency: reconciliationBankAccounts.agency, accountNumber: reconciliationBankAccounts.accountNumber };
export type ConstitutionalRuleBankAccount = { id: string; bankName: string; agency: string; accountNumber: string };
export type ConstitutionalRuleForClient = typeof bankClassificationRules.$inferSelect & { bankAccount: ConstitutionalRuleBankAccount | null };

export async function countConstitutionalRules(db: DatabaseExecutor) {
  const [row] = await db.select({ total: count() }).from(bankClassificationRules).where(eq(bankClassificationRules.tipoMovimento, "RECEITA_CONSTITUCIONAL"));
  return row.total;
}
export async function findConstitutionalRuleText(db: DatabaseExecutor, text: string) {
  const [row] = await db.select({ id: bankClassificationRules.id }).from(bankClassificationRules).where(and(eq(bankClassificationRules.textoProcurado, text), eq(bankClassificationRules.tipoMovimento, "RECEITA_CONSTITUCIONAL"))).limit(1);
  return row ?? null;
}
export async function listConstitutionalRules(db: DatabaseExecutor, bankAccountId?: string): Promise<ConstitutionalRuleForClient[]> {
  const rows = await db.select({ rule: bankClassificationRules, bankAccount: bankLabel }).from(bankClassificationRules).leftJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, bankClassificationRules.bankAccountId)).where(and(eq(bankClassificationRules.tipoMovimento, "RECEITA_CONSTITUCIONAL"), bankAccountId === undefined ? undefined : and(eq(bankClassificationRules.bankAccountId, bankAccountId), eq(bankClassificationRules.ativo, true)))).orderBy(asc(bankClassificationRules.prioridade));
  return rows.map(({ rule, bankAccount }) => ({ ...rule, bankAccount }));
}
export async function insertBankClassificationRule(db: DatabaseExecutor, input: typeof bankClassificationRules.$inferInsert) {
  const [row] = await db.insert(bankClassificationRules).values(input).returning();
  return row;
}
export async function updateBankClassificationRule(db: DatabaseExecutor, id: string, input: Partial<typeof bankClassificationRules.$inferInsert>) {
  await db.update(bankClassificationRules).set(input).where(eq(bankClassificationRules.id, id));
}
export async function listAutomationBankAccounts(db: DatabaseExecutor, filter: { bankName?: string; agency?: string; accountNumber?: string; id?: string; unitIds?: string[]; requireUnit?: boolean }) {
  return db.select().from(reconciliationBankAccounts).where(and(eq(reconciliationBankAccounts.isActive, true), filter.bankName === undefined ? undefined : eq(reconciliationBankAccounts.bankName, filter.bankName), filter.agency === undefined ? undefined : eq(reconciliationBankAccounts.agency, filter.agency), filter.accountNumber === undefined ? undefined : eq(reconciliationBankAccounts.accountNumber, filter.accountNumber), filter.id === undefined ? undefined : eq(reconciliationBankAccounts.id, filter.id), filter.unitIds === undefined ? undefined : inArray(reconciliationBankAccounts.budgetUnitId, filter.unitIds), filter.requireUnit ? isNotNull(reconciliationBankAccounts.budgetUnitId) : undefined)).orderBy(asc(reconciliationBankAccounts.agency), asc(reconciliationBankAccounts.accountNumber));
}
export async function listBankExceptionQueue(db: DatabaseExecutor, bank: string) {
  return db.select().from(bankExceptionQueueItems).where(and(eq(bankExceptionQueueItems.status, "PENDENTE"), eq(bankExceptionQueueItems.banco, bank))).orderBy(desc(bankExceptionQueueItems.createdAt));
}
export async function findBankException(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(bankExceptionQueueItems).where(eq(bankExceptionQueueItems.id, id));
  return row ?? null;
}
export async function updateBankException(db: DatabaseExecutor, id: string, input: Partial<typeof bankExceptionQueueItems.$inferInsert>) {
  await db.update(bankExceptionQueueItems).set(input).where(eq(bankExceptionQueueItems.id, id));
}
export async function insertBankException(db: DatabaseExecutor, input: typeof bankExceptionQueueItems.$inferInsert) {
  await db.insert(bankExceptionQueueItems).values(input);
}
export async function findBankStatementNotification(db: DatabaseExecutor, filter: { bank: string; agency: string; accountNumber: string; reference: string }) {
  const [row] = await db.select().from(bankStatementItems).where(and(eq(bankStatementItems.banco, filter.bank), eq(bankStatementItems.agencia, filter.agency), eq(bankStatementItems.contaNumero, filter.accountNumber), eq(bankStatementItems.codigoTransacao, filter.reference))).limit(1);
  return row ?? null;
}
export async function insertBankStatementNotification(db: DatabaseExecutor, input: typeof bankStatementItems.$inferInsert) {
  const [row] = await db.insert(bankStatementItems).values(input).returning();
  return row;
}
export async function findConstitutionalRevenueCodes(db: DatabaseExecutor, natureCode: string, sourceCode: string) {
  const [[nature], [source]] = await Promise.all([db.select({ id: planningRevenueNatures.id }).from(planningRevenueNatures).where(eq(planningRevenueNatures.code, natureCode)), db.select({ id: planningResourceSources.id }).from(planningResourceSources).where(eq(planningResourceSources.code, sourceCode))]);
  return { nature: nature ?? null, source: source ?? null };
}
export async function upsertConstitutionalRevenueNature(db: DatabaseExecutor, code: string, name: string) {
  await db.insert(planningRevenueNatures).values({ code, name }).onConflictDoUpdate({ target: planningRevenueNatures.code, set: { name } });
}
export async function findBankNotificationTechnicalUser(db: DatabaseExecutor) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1);
  return row ?? null;
}
