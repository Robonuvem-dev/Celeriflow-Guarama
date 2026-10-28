import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { accountingComponents, accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions, monthlyAccountingCloses } from "../../schema/finance-accounting";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "../../schema/planning-catalog";
import { financialAuditLogs } from "../../schema/finance-identity";
import { Decimal } from "../../decimal";
import { databaseTimestamp } from "@/db/temporal";
import type { JsonValue } from "../../json";
import type { AccountingComponentRecord, AccountingEntryRecord, AccountingRuleRecord, AccountingTransactionRecord } from "@/lib/contracts/finance-accounting";
import type { CatalogEntryWithVersion } from "@/lib/contracts/planning-catalog";

export async function lockAccountingMonth(db: DatabaseExecutor, key: string): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}
export async function findAccountingMonth(db: DatabaseExecutor, financialYearId: string, competence: Date) {
  const [row] = await db.select().from(monthlyAccountingCloses).where(and(eq(monthlyAccountingCloses.financialYearId, financialYearId), eq(monthlyAccountingCloses.competence, competence)));
  return row ?? null;
}
export async function countClosedAccountingMonths(db: DatabaseExecutor, financialYearId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(monthlyAccountingCloses).where(and(eq(monthlyAccountingCloses.financialYearId, financialYearId), eq(monthlyAccountingCloses.status, "FECHADO")));
  return row.total;
}
export async function listAccountingClassifications(db: DatabaseExecutor, kind: string, accountIds: string[], year?: number): Promise<CatalogEntryWithVersion[]> {
  if (!accountIds.length) return [];
  const rows = await db.select({ entry: planningCatalogEntries, version: planningCatalogVersions }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId))
    .where(and(eq(planningCatalogEntries.kind, kind), inArray(planningCatalogEntries.canonicalId, accountIds), eq(planningCatalogVersions.status, "PUBLISHED"), year === undefined ? undefined : eq(planningCatalogVersions.year, year)));
  return rows.map(({ entry, version }) => ({ ...entry, version }));
}
export async function listAccountingUnitBindings(db: DatabaseExecutor, budgetUnitId: string) {
  return db.select({ governmentEntityId: planningEntityUnits.governmentEntityId }).from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId));
}
export async function findAccountingTransaction(db: DatabaseExecutor, id: string): Promise<AccountingTransactionRecord | null> {
  const [row] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.id, id));
  return row ?? null;
}
export async function findAccountingReplay(db: DatabaseExecutor, key: string): Promise<AccountingTransactionRecord | null> {
  const [row] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, key));
  return row ?? null;
}
export async function listAccountingEntries(db: DatabaseExecutor, transactionId: string, filter: { accountId?: string; type?: string; entryId?: string } = {}): Promise<AccountingEntryRecord[]> {
  return db.select().from(accountingEntries).where(and(eq(accountingEntries.transactionId, transactionId), filter.accountId ? eq(accountingEntries.accountId, filter.accountId) : undefined, filter.type ? eq(accountingEntries.type, filter.type) : undefined, filter.entryId ? eq(accountingEntries.id, filter.entryId) : undefined));
}
export async function findAccountingEntryWithTransaction(db: DatabaseExecutor, id: string): Promise<(AccountingEntryRecord & { transaction: AccountingTransactionRecord | null }) | null> {
  const [row] = await db.select({ entry: accountingEntries, transaction: accountingTransactions }).from(accountingEntries).leftJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(eq(accountingEntries.id, id));
  return row ? { ...row.entry, transaction: row.transaction } : null;
}
export async function listAccountingPlans(db: DatabaseExecutor, ids: string[]): Promise<{ id: string; code: string }[]> {
  if (!ids.length) return [];
  return db.select({ id: accountingPlans.id, code: accountingPlans.code }).from(accountingPlans).where(inArray(accountingPlans.id, ids));
}
export async function hasAccountingPlanChildren(db: DatabaseExecutor, codes: string[]): Promise<boolean> {
  if (!codes.length) return false;
  const [row] = await db.select({ id: accountingPlans.id }).from(accountingPlans).where(or(...codes.map(code => like(accountingPlans.code, `${code}.%`)))).limit(1);
  return !!row;
}
export async function insertAccountingPosting(tx: DatabaseTransaction, transaction: typeof accountingTransactions.$inferInsert, entries: Omit<typeof accountingEntries.$inferInsert, "transactionId">[]): Promise<AccountingTransactionRecord> {
  const [row] = await tx.insert(accountingTransactions).values(transaction).returning();
  await tx.insert(accountingEntries).values(entries.map(entry => ({ ...entry, transactionId: row.id })));
  return row;
}
export async function insertAccountingAudit(db: DatabaseExecutor, actor: { usuarioId: string; employeeId: string | null; budgetUnitId?: string | null }, input: { action: string; entityType: string; entityId: string; payload: JsonValue; financialYearId?: string; budgetUnitId?: string }): Promise<void> {
  await db.insert(financialAuditLogs).values({ ...input, budgetUnitId: input.budgetUnitId || actor.budgetUnitId || undefined, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
}
export async function readAccountingEventRules(db: DatabaseExecutor, code: string): Promise<{ code: string; isActive: boolean; rules: (AccountingRuleRecord & { components: AccountingComponentRecord[] })[] } | null> {
  const [event] = await db.select({ id: accountingEvents.id, code: accountingEvents.code, isActive: accountingEvents.isActive }).from(accountingEvents).where(eq(accountingEvents.code, code));
  if (!event) return null;
  const rules = await db.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true)));
  const components = rules.length ? await db.select().from(accountingComponents).where(inArray(accountingComponents.ruleId, rules.map(rule => rule.id))).orderBy(asc(accountingComponents.sequence)) : [];
  return { ...event, rules: rules.map(rule => ({ ...rule, components: components.filter(component => component.ruleId === rule.id) })) };
}
export async function readAccountingPaymentBasis(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ status: string; date: string | Date; valueDecimal: string | null; netValueDecimal: string | null; executionFinancialYearId: string | null; financialYearId: string; payableType: string | null; accountingPlanId: string | null }>(sql`
    SELECT p.status,p.date,p."valueDecimal"::text,p."netValueDecimal"::text,p."executionFinancialYearId",a."financialYearId",r.type AS "payableType",b."accountingPlanId"
    FROM "Payment" p JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId"
    JOIN "BankAccount" b ON b.id=p."bankAccountId" LEFT JOIN "PayableCarryForward" r ON r.id=p."payableCarryForwardId" WHERE p.id=${id}`)).rows;
  return row ? { ...row, date: databaseTimestamp(row.date), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), netValueDecimal: row.netValueDecimal === null ? null : new Decimal(row.netValueDecimal) } : null;
}
export async function findAnnualEditionAudit(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, id));
  return row ?? null;
}
export async function listAnnualClearanceEntries(db: DatabaseExecutor, financialYearId: string) {
  const rows = await db.select({ entry: accountingEntries, account: { type: accountingPlans.type }, transaction: { budgetUnitId: accountingTransactions.budgetUnitId } }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).where(and(eq(accountingTransactions.financialYearId, financialYearId), eq(accountingTransactions.status, "POSTADO")));
  return rows.map(({ entry, account, transaction }) => ({ ...entry, account, transaction }));
}
export async function findAccountingSourcePosting(db: DatabaseExecutor, financialYearId: string, sourceType: string, sourceId: string) {
  const [row] = await db.select().from(accountingTransactions).where(and(eq(accountingTransactions.financialYearId, financialYearId), eq(accountingTransactions.sourceType, sourceType), eq(accountingTransactions.sourceId, sourceId), eq(accountingTransactions.status, "POSTADO"))).orderBy(asc(accountingTransactions.postedAt)).limit(1);
  if (!row) return null;
  const [entries, reversals] = await Promise.all([listAccountingEntries(db, row.id), db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, row.id)).limit(1)]);
  return { ...row, entries, reversedBy: reversals[0] ?? null };
}
