import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles, departments } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { sstBudgetUnits } from "@/db/schema/sst-reference";

/** Every list element is a bound parameter, including strings. */
export function sstParameters(values: readonly string[]): SQL {
  return sql.join(values.length ? values.map(value => sql`${value}`) : [sql`NULL`], sql`, `);
}
export function sstUnitFilter(context: AppContext, column: SQL): SQL {
  return isSystemAdministrator(context.user) ? sql`TRUE` : sql`${column} IN (${sstParameters(context.user.allowedBudgetUnitIds)})`;
}
export function sstDisciplineUnitFilter(context: AppContext, column: SQL, discipline: string, write = false): SQL {
  if (!canViewModule(context.user, "SST")) return sql`FALSE`;
  if (isSystemAdministrator(context.user)) return sql`TRUE`;
  return sql`${sstUnitFilter(context, column)} AND EXISTS (SELECT 1 FROM "SstAccessGrant" a WHERE a."budgetUnitId"=${column} AND a."usuarioId"=${context.user.id} AND a."isActive" AND a."canReadClinical" ${write ? sql`AND a."canAssess"` : sql``})
    AND EXISTS (SELECT 1 FROM "SstDisciplineGrant" d WHERE d."budgetUnitId"=${column} AND d."usuarioId"=${context.user.id} AND d.discipline=${discipline} AND d."isActive" AND d."canRead" ${write ? sql`AND d."canWrite"` : sql``})`;
}
export async function listSstUnits(database: DatabaseExecutor, context: AppContext, discipline?: string, write = false): Promise<{ id: string; code: string; name: string; secretariatId: string }[]> {
  return database.select({ id: sstBudgetUnits.id, code: sstBudgetUnits.code, name: sstBudgetUnits.name, secretariatId: sstBudgetUnits.secretariatId }).from(sstBudgetUnits)
    .where(discipline ? sstDisciplineUnitFilter(context, sql`${sstBudgetUnits.id}`, discipline, write) : sstUnitFilter(context, sql`${sstBudgetUnits.id}`)).orderBy(asc(sstBudgetUnits.name), asc(sstBudgetUnits.id));
}
export async function findSstUnit(database: DatabaseExecutor, id: string) {
  return (await database.select().from(sstBudgetUnits).where(eq(sstBudgetUnits.id, id)).limit(1))[0] ?? null;
}
export async function countSstSecretariatUnits(database: DatabaseExecutor, secretariatId: string | null): Promise<number> {
  const [row] = await database.select({ total: sql<number>`count(*)::int` }).from(sstBudgetUnits).where(secretariatId === null ? sql`${sstBudgetUnits.secretariatId} IS NULL` : eq(sstBudgetUnits.secretariatId, secretariatId));
  return row.total;
}
export async function findSstEmployee(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ employee: employees, person: people, role: roles, department: departments }).from(employees)
    .leftJoin(people, eq(employees.personId, people.id)).leftJoin(roles, eq(employees.roleId, roles.id)).leftJoin(departments, eq(employees.departmentId, departments.id)).where(eq(employees.id, id)).limit(1);
  return row ? { ...row.employee, person: row.person, role: row.role, department: row.department } : null;
}
export async function findSstPerson(database: DatabaseExecutor, id: string) {
  return (await database.select().from(people).where(eq(people.id, id)).limit(1))[0] ?? null;
}
export async function listSstDeliveryEmployees(database: DatabaseExecutor, ids: string[], secretariatId: string | null) {
  if (!ids.length) return [];
  return database.select({ employee: employees, role: roles, department: departments }).from(employees).leftJoin(roles, eq(employees.roleId, roles.id)).leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(inArray(employees.id, ids), eq(employees.isActive, true), secretariatId === null ? sql`${employees.secretariatId} IS NULL` : eq(employees.secretariatId, secretariatId))).then(rows => rows.map(row => ({ ...row.employee, role: row.role, department: row.department })));
}
