import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { AdministrativeUnitRecord, CalendarEventRecord, DepartmentRecord, EmployeeListItem, InstitutionRecord, ManagerOption, RoleRecord, SecretariatListItem, SecretariatRecord } from "@/lib/contracts/administration";
import type { DatabaseExecutor } from "../../transaction";
import { administrativeUnits, calendarEvents, departments, employees, institutions, roles, secretariats } from "../../schema/administration";

export async function listSecretariats(db: DatabaseExecutor): Promise<SecretariatRecord[]> {
  return db.select().from(secretariats).orderBy(asc(secretariats.name));
}

export async function listSecretariatDetails(db: DatabaseExecutor): Promise<SecretariatListItem[]> {
  const rows = await db.select({ record: secretariats,
    manager: { id: employees.id, name: employees.name, registration: employees.registration, isActive: employees.isActive },
    role: { name: roles.name }, departmentCount: sql<number>`(SELECT count(*)::int FROM "Department" d WHERE d."secretariatId"=${secretariats.id})`,
  }).from(secretariats).leftJoin(employees, eq(secretariats.managerId, employees.id))
    .leftJoin(roles, eq(employees.roleId, roles.id)).orderBy(asc(secretariats.name));
  return rows.map(row => ({ ...row.record, manager: row.manager ? { ...row.manager, role: row.role } : null, _count: { departments: row.departmentCount } }));
}

export async function listManagerOptions(db: DatabaseExecutor): Promise<ManagerOption[]> {
  return db.select({ id: employees.id, name: employees.name, registration: employees.registration, secretariatId: employees.secretariatId, role: { name: roles.name } })
    .from(employees).innerJoin(roles, eq(employees.roleId, roles.id)).where(and(eq(employees.isActive, true), eq(roles.isActive, true))).orderBy(asc(employees.name));
}

export async function listUnassignedManagerOptions(db: DatabaseExecutor): Promise<{ id: string; name: string; role: { name: string } }[]> {
  return db.select({ id: employees.id, name: employees.name, role: { name: roles.name } }).from(employees)
    .innerJoin(roles, eq(employees.roleId, roles.id)).where(and(eq(employees.isActive, true), eq(roles.isActive, true), isNull(employees.secretariatId), isNull(employees.departmentId), isNull(employees.unitId))).orderBy(asc(employees.name));
}

export async function listDepartments(db: DatabaseExecutor): Promise<DepartmentRecord[]> {
  return db.select().from(departments).orderBy(asc(departments.name));
}

export async function listDepartmentDetails(db: DatabaseExecutor): Promise<(DepartmentRecord & { secretariat: SecretariatRecord })[]> {
  const rows = await db.select({ record: departments, secretariat: secretariats }).from(departments)
    .innerJoin(secretariats, eq(departments.secretariatId, secretariats.id)).orderBy(asc(departments.name));
  return rows.map(row => ({ ...row.record, secretariat: row.secretariat }));
}

export async function listUnits(db: DatabaseExecutor): Promise<AdministrativeUnitRecord[]> {
  return db.select().from(administrativeUnits).orderBy(asc(administrativeUnits.name));
}

export async function listUnitDetails(db: DatabaseExecutor): Promise<(AdministrativeUnitRecord & { secretariat: SecretariatRecord })[]> {
  const rows = await db.select({ record: administrativeUnits, secretariat: secretariats }).from(administrativeUnits)
    .innerJoin(secretariats, eq(administrativeUnits.secretariatId, secretariats.id)).orderBy(asc(administrativeUnits.name));
  return rows.map(row => ({ ...row.record, secretariat: row.secretariat }));
}

export async function listActiveSecretariatOptions(db: DatabaseExecutor, ordered = false): Promise<{ id: string; name: string }[]> {
  const query = db.select({ id: secretariats.id, name: secretariats.name }).from(secretariats).where(eq(secretariats.isActive, true));
  return ordered ? query.orderBy(asc(secretariats.name)) : query;
}

export async function listRoles(db: DatabaseExecutor): Promise<RoleRecord[]> {
  return db.select().from(roles).orderBy(asc(roles.name));
}

export async function listRoleDetails(db: DatabaseExecutor): Promise<(RoleRecord & { _count: { employees: number } })[]> {
  const rows = await db.select({ record: roles, employees: sql<number>`count(${employees.id})::int` }).from(roles)
    .leftJoin(employees, eq(employees.roleId, roles.id)).groupBy(roles.id).orderBy(asc(roles.name));
  return rows.map(row => ({ ...row.record, _count: { employees: row.employees } }));
}

export async function listEmployeeDetails(db: DatabaseExecutor): Promise<EmployeeListItem[]> {
  const rows = await db.select({ record: employees, role: roles, secretariat: secretariats, department: departments }).from(employees)
    .leftJoin(roles, eq(employees.roleId, roles.id)).leftJoin(secretariats, eq(employees.secretariatId, secretariats.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id)).orderBy(asc(employees.name));
  return rows.map(row => ({ ...row.record, role: row.role, secretariat: row.secretariat, department: row.department }));
}

export async function listActiveRoleOptions(db: DatabaseExecutor): Promise<{ id: string; name: string }[]> {
  return db.select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.isActive, true));
}

export async function listActiveDepartmentOptions(db: DatabaseExecutor): Promise<{ id: string; name: string; secretariatId: string }[]> {
  return db.select({ id: departments.id, name: departments.name, secretariatId: departments.secretariatId }).from(departments).where(eq(departments.isActive, true));
}

export async function listCalendarEvents(db: DatabaseExecutor): Promise<CalendarEventRecord[]> {
  return db.select().from(calendarEvents).orderBy(asc(calendarEvents.date));
}

export async function findFirstInstitution(db: DatabaseExecutor): Promise<InstitutionRecord | null> {
  const [institution] = await db.select().from(institutions).limit(1);
  return institution ?? null;
}
