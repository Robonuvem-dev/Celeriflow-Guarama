import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { sstCertificates, sstCertificateReasons } from "@/db/schema/sst-certificates";
import { sstBoards } from "@/db/schema/sst-agenda";
import { sstBudgetUnits } from "@/db/schema/sst-reference";
import { employees } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import type { SstPageOption, SstPageUnit } from "@/lib/contracts/sst-pages";

export async function readSstNewCertificateOptions(database: DatabaseExecutor, unit: SstPageUnit | undefined, employeeId: string | undefined): Promise<{
  employees: (SstPageOption & { registration: string | null })[];
  reasons: (SstPageOption & { dependentPolicy: string })[]; dependents: SstPageOption[];
}> {
  const workers = unit ? await database.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(and(eq(employees.isActive, true), eq(employees.secretariatId, unit.secretariatId))).orderBy(asc(employees.name)) : [];
  const reasons = unit ? await database.select({ id: sstCertificateReasons.id, name: sstCertificateReasons.name, dependentPolicy: sstCertificateReasons.dependentPolicy }).from(sstCertificateReasons).where(and(eq(sstCertificateReasons.budgetUnitId, unit.id), eq(sstCertificateReasons.isActive, true))).orderBy(asc(sstCertificateReasons.name)) : [];
  const family = employeeId && workers.some(item => item.id === employeeId) ? await database.select({ id: dependents.id, name: dependents.name }).from(dependents).where(eq(dependents.employeeId, employeeId)) : [];
  return { employees: workers, reasons, dependents: family };
}
export async function findSstCertificateScope(database: DatabaseExecutor, id: string): Promise<{ budgetUnitId: string } | undefined> {
  return (await database.select({ budgetUnitId: sstCertificates.budgetUnitId }).from(sstCertificates).where(eq(sstCertificates.id, id)))[0];
}
export async function readSstCertificateDetailsOptions(database: DatabaseExecutor, id: string, unitId: string): Promise<{
  boards: SstPageOption[]; confirmation: { confirmed: boolean }[];
  revisions: { id: string; decision: string; reason: string; examinerCouncil: string; createdAt: Date; reconciliation: { status: string } }[];
}> {
  const boards = await database.select({ id: sstBoards.id, name: sstBoards.name }).from(sstBoards).where(and(eq(sstBoards.budgetUnitId, unitId), eq(sstBoards.isActive, true))).orderBy(asc(sstBoards.name)).limit(100);
  const revisions = (await database.execute<{ id: string; decision: string; reason: string; examinerCouncil: string; createdAt: string | Date; reconciliation: { status: string } }>(sql`SELECT id,decision,reason,"examinerCouncil","createdAt",reconciliation FROM "SstCertificateDecisionRevision" WHERE "certificateId"=${id} ORDER BY revision DESC`)).rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt) }));
  const confirmation = (await database.execute<{ confirmed: boolean }>(sql`SELECT confirmed FROM "SstCertificateLeaveConfirmation" WHERE "certificateId"=${id}`)).rows;
  return { boards, revisions, confirmation };
}
export async function readSstCertificateFinancialPage(database: DatabaseExecutor, id: string, requestedPage: string | undefined): Promise<{
  financialCount: { total: number }; financialPage: number;
  financial: { id: string; kind: string; competence: string; amount: string; payrollId: string; payrollItemId: string; compensated: boolean }[];
}> {
  const { rows: [financialCount] } = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "SstLeavePayrollOrigin" WHERE "certificateId"=${id}`);
  const financialPage = Math.min(Math.max(1, Math.trunc(Number(requestedPage)) || 1), Math.max(1, Math.ceil(financialCount.total / 20)));
  // amount is deliberately a display string, preserving every PostgreSQL numeric digit.
  const financial = (await database.execute<{ id: string; kind: string; competence: string; amount: string; payrollId: string; payrollItemId: string; compensated: boolean }>(sql`SELECT o.id,o.kind,o.competence,o."amountDecimal"::text AS amount,o."payrollId",o."payrollItemId",EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" r WHERE r."reversesId"=o.id) AS compensated FROM "SstLeavePayrollOrigin" o WHERE o."certificateId"=${id} ORDER BY o."createdAt" DESC,o.id LIMIT 20 OFFSET ${(financialPage - 1) * 20}`)).rows;
  return { financialCount, financialPage, financial };
}
export async function findSstCertificateReceipt(database: DatabaseExecutor, id: string): Promise<{
  id: string; budgetUnitId: string; protocolNumber: string; presentedAt: Date; startsAt: Date; endsAt: Date;
  employee: { name: string; registration: string | null }; budgetUnit: { name: string };
} | undefined> {
  return (await database.select({ id: sstCertificates.id, budgetUnitId: sstCertificates.budgetUnitId, protocolNumber: sstCertificates.protocolNumber, presentedAt: sstCertificates.presentedAt, startsAt: sstCertificates.startsAt, endsAt: sstCertificates.endsAt, employee: { name: employees.name, registration: employees.registration }, budgetUnit: { name: sstBudgetUnits.name } }).from(sstCertificates).innerJoin(employees, eq(employees.id, sstCertificates.employeeId)).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstCertificates.budgetUnitId)).where(eq(sstCertificates.id, id)))[0];
}
