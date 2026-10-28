import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { departments, employees, roles, secretariats } from "../../schema/administration";
import { people } from "../../schema/people";
import { hrPayrollRules, hrPayrollRuleSets } from "../../schema/personnel-configuration";
import type { JsonValue } from "../../json";
import type { PortalEmployee } from "@/lib/contracts/personnel";

export async function findActivePortalEmployee(db: DatabaseExecutor, employeeId: string): Promise<PortalEmployee | null> {
  const [row] = await db.select({ id: employees.id, name: employees.name, registration: employees.registration, role: { name: roles.name }, department: { name: departments.name }, secretariat: { name: secretariats.name } }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(secretariats, eq(secretariats.id, employees.secretariatId)).where(and(eq(employees.id, employeeId), eq(employees.isActive, true))).limit(1);
  return row ?? null;
}
export async function listActivePortalPolicyValues(db: DatabaseExecutor, now: Date): Promise<{ value: JsonValue }[]> {
  return db.select({ value: hrPayrollRules.value }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(and(eq(hrPayrollRules.category, "PORTAL"), eq(hrPayrollRules.valueType, "JSON"), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.status, "ATIVA"), lte(hrPayrollRuleSets.effectiveFrom, now), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, now))));
}
export async function listPublishedBirthdayEmployees(db: DatabaseExecutor, ids: string[]): Promise<{ name: string; birthDate: Date | null }[]> {
  if (!ids.length) return [];
  return db.select({ name: employees.name, birthDate: people.birthDate }).from(employees).innerJoin(people, eq(people.id, employees.personId)).where(and(inArray(employees.id, ids), eq(employees.isActive, true), eq(people.status, "Ativo"), isNotNull(people.birthDate))).orderBy(asc(employees.name), asc(employees.id));
}
