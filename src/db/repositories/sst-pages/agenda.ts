import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstAvailability, sstScheduleBlocks, sstAppointments } from "@/db/schema/sst-agenda";
import { sstBudgetUnits } from "@/db/schema/sst-reference";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import type { SstAppointmentPageDto, SstAvailabilityPageDto, SstPageOption, SstPageResult, SstSelectedAvailabilityPageDto } from "@/lib/contracts/sst-pages";

export async function readSstAgendaPage(database: DatabaseExecutor, unitIds: string[], params: { page?: string; availabilityId?: string }): Promise<{
  total: number; page: number; windows: SstAvailabilityPageDto[]; selected: SstSelectedAvailabilityPageDto | null;
}> {
  const where = and(inArray(sstAvailability.budgetUnitId, unitIds), eq(sstAvailability.isActive, true));
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstAvailability).where(where);
  const page = Math.min(Math.max(1, Math.trunc(Number(params.page)) || 1), Math.max(1, Math.ceil(total / 20)));
  const windows = await database.select({ window: sstAvailability, professional: { fullName: people.fullName } }).from(sstAvailability).innerJoin(people, eq(people.id, sstAvailability.professionalPersonId)).where(where).orderBy(asc(sstAvailability.startsAt), asc(sstAvailability.id)).limit(20).offset((page - 1) * 20).then(rows => rows.map(row => ({ ...row.window, professional: row.professional })));
  const [row] = params.availabilityId ? await database.select({ window: sstAvailability, professional: { fullName: people.fullName }, budgetUnit: sstBudgetUnits }).from(sstAvailability).innerJoin(people, eq(people.id, sstAvailability.professionalPersonId)).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstAvailability.budgetUnitId)).where(and(where, eq(sstAvailability.id, params.availabilityId))).limit(1) : [];
  const selected = row ? { ...row.window, professional: row.professional, budgetUnit: row.budgetUnit, blocks: await database.select().from(sstScheduleBlocks).where(eq(sstScheduleBlocks.availabilityId, row.window.id)), appointments: await database.select().from(sstAppointments).where(and(eq(sstAppointments.availabilityId, row.window.id), ne(sstAppointments.status, "CANCELLED"))) } : null;
  return { total, page, windows, selected };
}
export async function readSstAgendaEmployees(database: DatabaseExecutor, secretariatId: string): Promise<SstPageOption[]> {
  return database.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.secretariatId, secretariatId), eq(employees.isActive, true))).orderBy(asc(employees.name));
}
export async function readSstAppointmentsPage(database: DatabaseExecutor, unitIds: string[], params: { q?: string; page?: string }): Promise<SstPageResult<SstAppointmentPageDto & { employee: { name: string }; availability: { unitName: string; professional: { fullName: string } } }>> {
  const where = and(inArray(sstAvailability.budgetUnitId, unitIds), params.q ? ilike(employees.name, `%${params.q}%`) : undefined);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstAppointments).innerJoin(sstAvailability, eq(sstAvailability.id, sstAppointments.availabilityId)).innerJoin(employees, eq(employees.id, sstAppointments.employeeId)).where(where);
  const page = Math.min(Math.max(1, Math.trunc(Number(params.page)) || 1), Math.max(1, Math.ceil(total / 20)));
  const records = await database.select({ appointment: sstAppointments, employee: { name: employees.name }, unitName: sstAvailability.unitName, professional: { fullName: people.fullName } }).from(sstAppointments).innerJoin(sstAvailability, eq(sstAvailability.id, sstAppointments.availabilityId)).innerJoin(employees, eq(employees.id, sstAppointments.employeeId)).innerJoin(people, eq(people.id, sstAvailability.professionalPersonId)).where(where).orderBy(desc(sstAppointments.startsAt), asc(sstAppointments.id)).limit(20).offset((page - 1) * 20).then(rows => rows.map(row => ({ ...row.appointment, employee: row.employee, availability: { unitName: row.unitName, professional: row.professional } })));
  return { total, page, records };
}
export async function findSstAppointmentPage(database: DatabaseExecutor, id: string): Promise<(SstAppointmentPageDto & { employee: { name: string; registration: string | null }; availability: SstAvailabilityPageDto }) | null> {
  const [row] = await database.select({ appointment: sstAppointments, employee: { name: employees.name, registration: employees.registration }, availability: sstAvailability, professional: { fullName: people.fullName } }).from(sstAppointments).innerJoin(sstAvailability, eq(sstAvailability.id, sstAppointments.availabilityId)).innerJoin(employees, eq(employees.id, sstAppointments.employeeId)).innerJoin(people, eq(people.id, sstAvailability.professionalPersonId)).where(eq(sstAppointments.id, id));
  return row ? { ...row.appointment, employee: row.employee, availability: { ...row.availability, professional: row.professional } } : null;
}
