import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxActiveDebts, taxPayments } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { addresses, companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { itbiDocumentSequences } from "@/db/schema/tax-itbi";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import type { ActiveDebtRecord } from "@/lib/contracts/tax-active-debt";

export function requiredDebtRow<T>(row: T | undefined, message = "Registro não encontrado."): T {
  if (row === undefined) throw new Error(message);
  return row;
}
export function assessmentVisibility(allowed?: string[]): SQL | undefined {
  return allowed === undefined ? undefined : allowed.length ? sql`${taxAssessments.calculationSnapshot}->'budgetUnitId' IN (${sql.join(allowed.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
}
export function debtVisibility(allowed?: string[]): SQL | undefined {
  if (allowed === undefined) return undefined;
  if (!allowed.length) return sql`false`;
  return or(inArray(taxActiveDebts.budgetUnitId, allowed), and(isNull(taxActiveDebts.budgetUnitId), sql`EXISTS (SELECT 1 FROM "TaxAssessment" a WHERE a.id=${taxActiveDebts.assessmentId} AND a."calculationSnapshot"->'budgetUnitId' IN (${sql.join(allowed.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)}))`));
}
export async function readDebt(database: DatabaseExecutor, id: string): Promise<ActiveDebtRecord> {
  return requiredDebtRow((await database.select().from(taxActiveDebts).where(eq(taxActiveDebts.id, id)).limit(1))[0], "Dívida não encontrada.");
}
export async function lockDebtOrigin(tx: DatabaseTransaction, id: string): Promise<void> {
  const origin = await readDebt(tx, id);
  if (origin.assessmentId) await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.id, origin.assessmentId)).for("update");
  await tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.id, id)).for("update");
}
export async function lockDebtRows(tx: DatabaseTransaction, ids: string[]): Promise<void> {
  // Stable global order: assessment -> debt; shared with financial writers.
  const origins = await tx.select({ id: taxActiveDebts.assessmentId }).from(taxActiveDebts).where(inArray(taxActiveDebts.id, ids));
  for (const id of [...new Set(origins.flatMap(row => row.id ? [row.id] : []))].sort()) await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.id, id)).for("update");
  for (const id of [...new Set(ids)].sort()) await tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.id, id)).for("update");
}
export async function nextDebtSequence(tx: DatabaseTransaction, year: number, documentType: string): Promise<number> {
  return (await tx.insert(itbiDocumentSequences).values({ year, documentType, currentValue: 1 }).onConflictDoUpdate({ target: [itbiDocumentSequences.year, itbiDocumentSequences.documentType], set: { currentValue: sql`${itbiDocumentSequences.currentValue}+1`, updatedAt: new Date() } }).returning({ value: itbiDocumentSequences.currentValue }))[0].value;
}
export async function readDebtTaxpayer(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.id, id)).limit(1);
  if (!row) return null;
  const locations = await database.select().from(addresses).where(or(row.person ? eq(addresses.personId, row.person.id) : sql`false`, row.company ? eq(addresses.companyId, row.company.id) : sql`false`));
  return { ...row.taxpayer, person: row.person ? { ...row.person, addresses: locations.filter(address => address.personId === row.person?.id) } : null, company: row.company ? { ...row.company, addresses: locations.filter(address => address.companyId === row.company?.id) } : null };
}
export async function readDebtPayments(database: DatabaseExecutor, assessmentIds: string[]) {
  return database.select({ payment: taxPayments, assessmentId: taxGuides.assessmentId }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(inArray(taxGuides.assessmentId, assessmentIds), eq(taxPayments.status, "Confirmado"))).orderBy(asc(taxPayments.id));
}
export async function readDebtBinding(database: DatabaseExecutor, budgetUnitId: string) {
  return (await database.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId)).limit(1))[0] ?? null;
}
