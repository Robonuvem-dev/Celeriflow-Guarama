import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { personnelFiscalDefinitions } from "../../schema/finance-personnel-fiscal";
import { financialYears } from "../../schema/finance-years";
import { fiscalAccountingEntries, fiscalAccountingTransactions, fiscalMonthlyCloses } from "../../schema/finance-fiscal-indices";
import { listFiscalOriginalTransactions } from "./fiscal-indices";

export async function insertPersonnelFiscalDefinition(tx: DatabaseTransaction, input: Omit<typeof personnelFiscalDefinitions.$inferInsert, "revision">) {
  const [last] = await tx.select({ revision: personnelFiscalDefinitions.revision }).from(personnelFiscalDefinitions).where(eq(personnelFiscalDefinitions.financialYearId, input.financialYearId)).orderBy(desc(personnelFiscalDefinitions.revision)).limit(1);
  const [row] = await tx.insert(personnelFiscalDefinitions).values({ ...input, revision: (last?.revision ?? 0) + 1 }).returning();
  return row;
}
export async function readPersonnelFiscalDefinition(db: DatabaseExecutor, financialYearId: string, through: Date) {
  const [row] = await db.select().from(personnelFiscalDefinitions).where(and(eq(personnelFiscalDefinitions.financialYearId, financialYearId), lte(personnelFiscalDefinitions.effectiveFrom, through))).orderBy(desc(personnelFiscalDefinitions.effectiveFrom), desc(personnelFiscalDefinitions.revision)).limit(1);
  return row ?? null;
}
export async function listPersonnelFiscalYears(db: DatabaseExecutor, governmentEntityId: string, years: number[]) {
  if (!years.length) return [];
  return db.select({ id: financialYears.id, year: financialYears.year }).from(financialYears).where(and(eq(financialYears.governmentEntityId, governmentEntityId), inArray(financialYears.year, years)));
}
export async function listPersonnelFiscalCloses(db: DatabaseExecutor, yearIds: string[], start: Date, through: Date) {
  if (!yearIds.length) return [];
  return db.select({ id: fiscalMonthlyCloses.id, competence: fiscalMonthlyCloses.competence }).from(fiscalMonthlyCloses).where(and(inArray(fiscalMonthlyCloses.financialYearId, yearIds), eq(fiscalMonthlyCloses.status, "FECHADO"), gte(fiscalMonthlyCloses.competence, start), lte(fiscalMonthlyCloses.competence, through)));
}
export async function listPersonnelFiscalEntries(db: DatabaseExecutor, input: { accountIds: string[]; yearIds: string[]; governmentEntityId: string; unitIds: string[]; start: Date; through: Date }) {
  if (!input.accountIds.length || !input.yearIds.length || !input.unitIds.length) return [];
  const rows = await db.select({ entry: fiscalAccountingEntries, transaction: fiscalAccountingTransactions }).from(fiscalAccountingEntries).innerJoin(fiscalAccountingTransactions, eq(fiscalAccountingTransactions.id, fiscalAccountingEntries.transactionId)).where(and(inArray(fiscalAccountingEntries.accountId, input.accountIds), eq(fiscalAccountingTransactions.status, "POSTADO"), eq(fiscalAccountingTransactions.governmentEntityId, input.governmentEntityId), inArray(fiscalAccountingTransactions.financialYearId, input.yearIds), inArray(fiscalAccountingTransactions.budgetUnitId, input.unitIds), gte(fiscalAccountingTransactions.date, input.start), lte(fiscalAccountingTransactions.date, input.through))).orderBy(asc(fiscalAccountingEntries.id));
  const originals = await listFiscalOriginalTransactions(db, [...new Set(rows.flatMap(row => row.transaction.reversalOfId ? [row.transaction.reversalOfId] : []))]);
  return rows.map(({ entry, transaction }) => ({ ...entry, transaction: { ...transaction, reversalOf: originals.find(original => original.id === transaction.reversalOfId) ?? null } }));
}
