import { and, desc, eq, ne } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { annualAccountingCloses, monthlyAccountingCloseEvents, monthlyAccountingCloses } from "../../schema/finance-accounting";
import { financialYears } from "../../schema/finance-years";

export async function insertAccountingMonthClose(tx: DatabaseTransaction, data: typeof monthlyAccountingCloses.$inferInsert) {
  return (await tx.insert(monthlyAccountingCloses).values(data).returning())[0];
}
export async function updateAccountingMonthClose(tx: DatabaseTransaction, id: string, data: Partial<Omit<typeof monthlyAccountingCloses.$inferInsert, "id">>) {
  return (await tx.update(monthlyAccountingCloses).set(data).where(eq(monthlyAccountingCloses.id, id)).returning())[0];
}
export async function insertAccountingCloseEvent(tx: DatabaseTransaction, data: typeof monthlyAccountingCloseEvents.$inferInsert): Promise<void> {
  await tx.insert(monthlyAccountingCloseEvents).values(data);
}
export async function findLatestAccountingCloseEvent(db: DatabaseExecutor, closeId: string, action: string) {
  return (await db.select().from(monthlyAccountingCloseEvents).where(and(eq(monthlyAccountingCloseEvents.monthlyAccountingCloseId, closeId), eq(monthlyAccountingCloseEvents.action, action))).orderBy(desc(monthlyAccountingCloseEvents.createdAt)).limit(1))[0] ?? null;
}
export async function findAnnualAccountingClose(db: DatabaseExecutor, financialYearId: string) {
  return (await db.select().from(annualAccountingCloses).where(eq(annualAccountingCloses.financialYearId, financialYearId)))[0] ?? null;
}
export async function insertAnnualAccountingClose(tx: DatabaseTransaction, data: typeof annualAccountingCloses.$inferInsert) {
  return (await tx.insert(annualAccountingCloses).values(data).returning())[0];
}
export async function updateAnnualAccountingClose(tx: DatabaseTransaction, id: string, data: Partial<Omit<typeof annualAccountingCloses.$inferInsert, "id">>) {
  return (await tx.update(annualAccountingCloses).set(data).where(eq(annualAccountingCloses.id, id)).returning())[0];
}
export async function demobilizeAnnualAccountingClose(tx: DatabaseTransaction, financialYearId: string): Promise<void> {
  await tx.update(annualAccountingCloses).set({ status: "INSCRICAO_DESMOVIMENTADA" }).where(and(eq(annualAccountingCloses.financialYearId, financialYearId), ne(annualAccountingCloses.status, "ENCERRADO")));
}
export async function updateAccountingYearStatus(tx: DatabaseTransaction, financialYearId: string, status: string): Promise<void> {
  await tx.update(financialYears).set({ status }).where(eq(financialYears.id, financialYearId));
}
