import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { PersistenceError } from "../../errors";
import { administrativeUnits, calendarEvents, departments, employees, internalDemands, roles, secretariats } from "../../schema/administration";

function requireUpdated(rows: { id: string }[]): void {
  if (!rows.length) throw new PersistenceError("not-found", "Registro não encontrado.");
}

export async function countSecretariatActiveChildren(db: DatabaseExecutor, id: string): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT (
    (SELECT count(*) FROM "Department" WHERE "secretariatId"=${id} AND "isActive"=true) +
    (SELECT count(*) FROM "AdministrativeUnit" WHERE "secretariatId"=${id} AND "isActive"=true) +
    (SELECT count(*) FROM "Employee" WHERE "secretariatId"=${id} AND "isActive"=true)
  )::int AS count`);
  return result.rows[0].count;
}

export async function setSecretariatActive(db: DatabaseExecutor, id: string, isActive: boolean): Promise<void> {
  requireUpdated(await db.update(secretariats).set({ isActive }).where(eq(secretariats.id, id)).returning({ id: secretariats.id }));
}

export async function updateSecretariat(db: DatabaseExecutor, id: string, input: { name: string; acronym: string; managerId: string | null; managerName: string | null }): Promise<void> {
  requireUpdated(await db.update(secretariats).set(input).where(eq(secretariats.id, id)).returning({ id: secretariats.id }));
}

export async function countDepartmentEmployees(db: DatabaseExecutor, departmentId: string, activeOnly = false): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(and(eq(employees.departmentId, departmentId), activeOnly ? eq(employees.isActive, true) : undefined));
  return row.count;
}

export async function findDepartmentHierarchy(db: DatabaseExecutor, id: string): Promise<{ secretariatId: string; secretariat: { isActive: boolean } } | null> {
  const [row] = await db.select({ secretariatId: departments.secretariatId, secretariat: { isActive: secretariats.isActive } }).from(departments)
    .innerJoin(secretariats, eq(departments.secretariatId, secretariats.id)).where(eq(departments.id, id)).limit(1);
  return row ?? null;
}

export async function findSecretariatActivation(db: DatabaseExecutor, id: string): Promise<{ isActive: boolean } | null> {
  const [row] = await db.select({ isActive: secretariats.isActive }).from(secretariats).where(eq(secretariats.id, id)).limit(1);
  return row ?? null;
}

export async function setDepartmentActive(db: DatabaseExecutor, id: string, isActive: boolean): Promise<void> {
  requireUpdated(await db.update(departments).set({ isActive }).where(eq(departments.id, id)).returning({ id: departments.id }));
}

export async function updateDepartment(db: DatabaseExecutor, id: string, input: { name: string; description: string; secretariatId: string }): Promise<void> {
  requireUpdated(await db.update(departments).set(input).where(eq(departments.id, id)).returning({ id: departments.id }));
}

export async function countManagersByRole(db: DatabaseExecutor, roleId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(secretariats).innerJoin(employees, eq(secretariats.managerId, employees.id)).where(eq(employees.roleId, roleId));
  return row.count;
}

export async function setRoleActive(db: DatabaseExecutor, id: string, isActive: boolean): Promise<void> {
  requireUpdated(await db.update(roles).set({ isActive }).where(eq(roles.id, id)).returning({ id: roles.id }));
}

export async function findRoleDuplicate(db: DatabaseExecutor, id: string, name: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: roles.id }).from(roles).where(and(ne(roles.id, id), sql`lower(${roles.name})=lower(${name})`)).limit(1);
  return row ?? null;
}

export async function updateRole(db: DatabaseExecutor, id: string, input: { name: string; description: string | null; level: string | null; canSign: boolean }): Promise<void> {
  requireUpdated(await db.update(roles).set(input).where(eq(roles.id, id)).returning({ id: roles.id }));
}

export async function setEmployeeActive(db: DatabaseExecutor, id: string, isActive: boolean): Promise<void> {
  requireUpdated(await db.update(employees).set({ isActive }).where(eq(employees.id, id)).returning({ id: employees.id }));
}

export async function updateEmployee(db: DatabaseExecutor, id: string, input: { name: string; email: string; cpf: string; roleId: string | null; secretariatId: string | null; departmentId: string | null }): Promise<void> {
  requireUpdated(await db.update(employees).set(input).where(eq(employees.id, id)).returning({ id: employees.id }));
  await db.update(secretariats).set({ managerName: input.name }).where(eq(secretariats.managerId, id));
}

export async function countUnitEmployees(db: DatabaseExecutor, unitId: string, activeOnly = false): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(and(eq(employees.unitId, unitId), activeOnly ? eq(employees.isActive, true) : undefined));
  return row.count;
}

export async function findUnitHierarchy(db: DatabaseExecutor, id: string): Promise<{ secretariatId: string; secretariat: { isActive: boolean } } | null> {
  const [row] = await db.select({ secretariatId: administrativeUnits.secretariatId, secretariat: { isActive: secretariats.isActive } }).from(administrativeUnits)
    .innerJoin(secretariats, eq(administrativeUnits.secretariatId, secretariats.id)).where(eq(administrativeUnits.id, id)).limit(1);
  return row ?? null;
}

export async function setUnitActive(db: DatabaseExecutor, id: string, isActive: boolean): Promise<void> {
  requireUpdated(await db.update(administrativeUnits).set({ isActive }).where(eq(administrativeUnits.id, id)).returning({ id: administrativeUnits.id }));
}

export async function updateUnit(db: DatabaseExecutor, id: string, input: { name: string; type: string; address: string; managerName: string; secretariatId: string }): Promise<void> {
  requireUpdated(await db.update(administrativeUnits).set(input).where(eq(administrativeUnits.id, id)).returning({ id: administrativeUnits.id }));
}

export async function updateInternalDemand(db: DatabaseExecutor, id: string, input: { title: string; status: string; priority: string; assigneeId: string | null; secretariatId: string | null; departmentId: string | null }): Promise<void> {
  requireUpdated(await db.update(internalDemands).set(input).where(eq(internalDemands.id, id)).returning({ id: internalDemands.id }));
}

export async function deleteCalendarEvent(db: DatabaseExecutor, id: string): Promise<void> {
  requireUpdated(await db.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning({ id: calendarEvents.id }));
}

export async function updateCalendarEvent(db: DatabaseExecutor, id: string, input: { title: string; description?: string | null; date: Date; type: string; isHoliday: boolean }): Promise<void> {
  requireUpdated(await db.update(calendarEvents).set(input).where(eq(calendarEvents.id, id)).returning({ id: calendarEvents.id }));
}
