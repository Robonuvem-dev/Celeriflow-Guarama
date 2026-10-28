import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { financialAuditLogs } from "../../schema/finance-identity";
import { accountingEntries, accountingPlans, accountingTransactions } from "../../schema/finance-accounting";
import type { JsonValue } from "../../json";
import type { FinancialAuditRecord } from "@/lib/contracts/finance-accounting";

export type AnnualAuditFilter = { action: string; entityType?: string; entityId?: string; financialYearId?: string; requestKey?: string; sourceFinancialYearId?: string; sourcePayableCarryForwardId?: string; differentFinancialYearId?: string; since?: Date; latest?: boolean };
export async function listAnnualAuditRecords(db: DatabaseExecutor, filter: AnnualAuditFilter, limit?: number): Promise<FinancialAuditRecord[]> {
  const query = db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, filter.action), filter.entityType ? eq(financialAuditLogs.entityType, filter.entityType) : undefined, filter.entityId ? eq(financialAuditLogs.entityId, filter.entityId) : undefined, filter.financialYearId ? eq(financialAuditLogs.financialYearId, filter.financialYearId) : undefined, filter.differentFinancialYearId ? ne(financialAuditLogs.financialYearId, filter.differentFinancialYearId) : undefined, filter.since ? gte(financialAuditLogs.createdAt, filter.since) : undefined, filter.requestKey ? sql`${financialAuditLogs.payload}->>'requestKey' = ${filter.requestKey}` : undefined, filter.sourceFinancialYearId ? sql`${financialAuditLogs.payload}->>'sourceFinancialYearId' = ${filter.sourceFinancialYearId}` : undefined, filter.sourcePayableCarryForwardId ? sql`${financialAuditLogs.payload}->>'sourcePayableCarryForwardId' = ${filter.sourcePayableCarryForwardId}` : undefined)).$dynamic();
  if (filter.latest) query.orderBy(desc(financialAuditLogs.createdAt), desc(financialAuditLogs.id));
  if (limit !== undefined) query.limit(limit);
  const rows = await query;
  return rows.map(row => ({ ...row, payload: row.payload as JsonValue | null }));
}
export async function insertAnnualAudit(tx: DatabaseTransaction, input: Omit<FinancialAuditRecord, "id" | "createdAt" | "budgetUnitId" | "financialYearId" | "authorEmployeeId"> & { budgetUnitId?: string; financialYearId?: string; authorEmployeeId?: string | null }): Promise<FinancialAuditRecord> {
  const [row] = await tx.insert(financialAuditLogs).values(input).returning();
  return { ...row, payload: row.payload as JsonValue | null };
}
export async function readAnnualAudit(db: DatabaseExecutor, id: string): Promise<FinancialAuditRecord> {
  const [row] = await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, id));
  if (!row) throw new Error("Edição documental anual não encontrada.");
  return { ...row, payload: row.payload as JsonValue | null };
}
export async function listAnnualSourceEntries(db: DatabaseExecutor, financialYearId: string, through: Date) {
  const rows = await db.select({ entry: accountingEntries, account: accountingPlans, transaction: accountingTransactions }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).where(and(eq(accountingTransactions.financialYearId, financialYearId), eq(accountingTransactions.status, "POSTADO"), lte(accountingTransactions.date, through))).orderBy(asc(accountingEntries.id));
  return rows.map(({ entry, account, transaction }) => ({ ...entry, account, transaction }));
}
export async function listAnnualPostings(db: DatabaseExecutor, filter: { id?: string; sourceType?: string; sourceId?: string; financialYearId?: string; sourceModule?: string; eventType?: string; governmentEntityId?: string; budgetUnitId?: string; status?: string }, limit?: number) {
  const query = db.select().from(accountingTransactions).where(and(filter.id ? eq(accountingTransactions.id, filter.id) : undefined, filter.sourceType ? eq(accountingTransactions.sourceType, filter.sourceType) : undefined, filter.sourceId ? eq(accountingTransactions.sourceId, filter.sourceId) : undefined, filter.financialYearId ? eq(accountingTransactions.financialYearId, filter.financialYearId) : undefined, filter.sourceModule ? eq(accountingTransactions.sourceModule, filter.sourceModule) : undefined, filter.eventType ? eq(accountingTransactions.eventType, filter.eventType) : undefined, filter.governmentEntityId ? eq(accountingTransactions.governmentEntityId, filter.governmentEntityId) : undefined, filter.budgetUnitId ? eq(accountingTransactions.budgetUnitId, filter.budgetUnitId) : undefined, filter.status ? eq(accountingTransactions.status, filter.status) : undefined)).orderBy(asc(accountingTransactions.id)).$dynamic();
  if (limit !== undefined) query.limit(limit);
  const postings = await query;
  if (!postings.length) return [];
  const ids = postings.map(posting => posting.id);
  const [entries, reversals] = await Promise.all([db.select().from(accountingEntries).where(inArray(accountingEntries.transactionId, ids)), db.select({ id: accountingTransactions.id, reversalOfId: accountingTransactions.reversalOfId }).from(accountingTransactions).where(inArray(accountingTransactions.reversalOfId, ids))]);
  return postings.map(posting => ({ ...posting, entries: entries.filter(entry => entry.transactionId === posting.id), reversedBy: reversals.find(reversal => reversal.reversalOfId === posting.id) ?? null }));
}
export async function readAnnualResultAccount(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(accountingPlans).where(eq(accountingPlans.id, id));
  if (!row) throw new Error("Conta de contrapartida anual não encontrada.");
  return row;
}
export async function listAnnualCashOrigins(db: DatabaseExecutor, unitIds: string[], through: Date) {
  if (!unitIds.length) return [];
  const banks = (await db.execute<{ id: string; budgetUnitId: string; resourceSourceId: string | null }>(sql`SELECT id,"budgetUnitId","resourceSourceId" FROM "BankAccount" WHERE "budgetUnitId" IN (${sql.join(unitIds.map(id => sql`${id}`), sql`,`)})`)).rows;
  const result = [];
  for (const bank of banks) {
    const permittedSources = (await db.execute<{ resourceSourceId: string }>(sql`SELECT "resourceSourceId" FROM "BankAccountResourceSource" WHERE "bankAccountId"=${bank.id}`)).rows;
    const movements = (await db.execute<{ resourceSourceId: string | null }>(sql`SELECT DISTINCT "resourceSourceId" FROM "TreasuryMovement" WHERE "bankAccountId"=${bank.id} AND status='Confirmado' AND date<=${through}`)).rows;
    const redistributions = (await db.execute<{ sourceResourceSourceId: string; destinationResourceSourceId: string }>(sql`SELECT s."sourceResourceSourceId",s."destinationResourceSourceId" FROM "RevenueResourceRedistribution" s JOIN "Revenue" r ON r.id=s."revenueId" WHERE r."bankAccountId"=${bank.id} AND s.date<=${through}`)).rows;
    result.push({ ...bank, permittedSources, movements, redistributions });
  }
  return result;
}
export async function hasAnnualRapDependents(db: DatabaseExecutor, yearId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT p.id FROM "PayableCarryForward" p LEFT JOIN "PayableCarryForward" s ON s."previousPayableCarryForwardId"=p.id WHERE p."financialYearId"=${yearId} AND p."originFinancialYearId"=${yearId} AND (p.status NOT IN ('PENDENTE','INSCRICAO_DESMOVIMENTADA') OR (s.id IS NOT NULL AND s.status<>'TRANSPORTE_DESMOVIMENTADO') OR EXISTS(SELECT 1 FROM "Payment" m WHERE m."payableCarryForwardId"=p.id AND m.status IN ('Emitida','Paga')) OR EXISTS(SELECT 1 FROM "Settlement" l WHERE l."payableCarryForwardId"=p.id AND l.status='Liquidado')) LIMIT 1`)).rows.length > 0;
}
