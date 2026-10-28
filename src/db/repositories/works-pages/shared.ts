import { and, asc, desc, eq, ilike, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksPageAccess } from "@/lib/contracts/works-pages";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies, realEstates } from "@/db/schema/registry";
import { processSubjects, processTypes } from "@/db/schema/processes";

export function worksPage(value: string | undefined, total: number) {
  return Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(value || "1", 10) || 1));
}

export function departmentScope(access: WorksPageAccess, department: SQLWrapper, enforcement = false): SQL {
  if (access.administrator) return sql`true`;
  if (!access.departmentId || !(enforcement ? access.roles.some(role => ["INSPECTOR", "MANAGER"].includes(role)) : access.roles.length)) return sql`false`;
  return sql`${department} = ${access.departmentId}`;
}

// PostgreSQL LIKE wildcard semantics match the previous contains/insensitive filters.
export function contains(column: SQLWrapper, value: string) { return ilike(sql`${column}`, `%${value}%`); }

export function listPagePeople(database: DatabaseExecutor, limit?: number) {
  return database.select({ id: people.id, fullName: people.fullName }).from(people).where(eq(people.status, "Ativo")).orderBy(asc(people.fullName)).limit(limit ?? 2_147_483_647);
}
export function listPageCompanies(database: DatabaseExecutor, activeOnly = true, limit?: number) {
  return database.select({ id: companies.id, corporateName: companies.corporateName }).from(companies).where(activeOnly ? eq(companies.status, "Ativo") : undefined).orderBy(asc(companies.corporateName)).limit(limit ?? 2_147_483_647);
}
export function listPageProperties(database: DatabaseExecutor) {
  return database.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number }).from(realEstates).orderBy(asc(realEstates.municipalInsc));
}
export function listPageSubjects(database: DatabaseExecutor, ids?: string[], ordered = true) {
  const query = database.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId, processType: { name: processTypes.name } }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId))
    .where(and(eq(processSubjects.isActive, true), eq(processSubjects.allowsInternalOpening, true), eq(processTypes.isActive, true), eq(processTypes.allowsInternalOpening, true), ids ? inArray(processSubjects.id, ids) : undefined));
  return ordered ? query.orderBy(asc(processSubjects.name)) : query;
}
export function listPageDepartments(database: DatabaseExecutor, access?: WorksPageAccess) {
  return database.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.isActive, true), access && !access.administrator ? eq(departments.id, access.departmentId || "") : undefined)).orderBy(asc(departments.name));
}
export function listPageEmployees(database: DatabaseExecutor, access?: WorksPageAccess) {
  return database.select({ id: employees.id, name: employees.name, departmentId: employees.departmentId }).from(employees).where(and(eq(employees.isActive, true), access && !access.administrator ? eq(employees.departmentId, access.departmentId || "") : undefined)).orderBy(asc(employees.name));
}
export function pageEmployeeNames(database: DatabaseExecutor, ids: string[]) {
  return database.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, ids));
}

export const newest = (createdAt: SQLWrapper, id: SQLWrapper) => [desc(createdAt), asc(id)];
