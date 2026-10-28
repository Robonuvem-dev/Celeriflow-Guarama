import { and, asc, eq, getTableColumns, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { hrPayrollRules, hrPayrollRuleSets } from "../../schema/personnel-configuration";
import { employees } from "../../schema/administration";
import { employeePortalRequests } from "../../schema/employee-portal";
import type { PortalIntegrationEvent, PortalPolicy, PortalRequest } from "@/lib/contracts/employee-portal";
import type { JsonValue } from "../../json";

/** SQL result helpers only: callers supply explicit, parameterized SQL and DTOs. */
export async function portalRows<T extends Record<string, unknown>>(db: DatabaseExecutor, query: SQL) {
  // Neon/Drizzle intentionally leaves SQL date/timestamp OIDs as text for raw
  // execution. Decode only physical temporal columns using driver metadata;
  // JSON strings (including ISO strings inside payloads) remain untouched.
  const result = await db.execute<T>(query);
  const temporal = result.fields.filter(field => [1082, 1114, 1184].includes(field.dataTypeID));
  for (const row of result.rows) for (const field of temporal) {
    const value = row[field.name];
    if (typeof value === "string") Reflect.set(row, field.name, new Date(field.dataTypeID === 1082 ? `${value}T00:00:00.000Z` : field.dataTypeID === 1114 ? `${value.replace(" ", "T")}Z` : value));
  }
  return result.rows;
}
export async function portalFirst<T extends Record<string, unknown>>(db: DatabaseExecutor, query: SQL) {
  return (await portalRows<T>(db, query))[0] ?? null;
}
export async function portalRequired<T extends Record<string, unknown>>(db: DatabaseExecutor, query: SQL) {
  const row = await portalFirst<T>(db, query);
  if (!row) throw new Error("Registro não encontrado.");
  return row;
}
export async function portalCount(db: DatabaseExecutor, query: SQL): Promise<number> {
  return Number((await portalRequired<{ count: string | number }>(db, query)).count);
}
export async function activePortalEmployee(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.isActive, true))).limit(1);
  return row ?? null;
}
export async function activePortalPolicies(db: DatabaseExecutor, now = new Date()): Promise<PortalPolicy[]> {
  return db.select(getTableColumns(hrPayrollRules)).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId))
    .where(and(eq(hrPayrollRules.category, "PORTAL"), eq(hrPayrollRules.valueType, "JSON"), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.status, "ATIVA"), lte(hrPayrollRuleSets.effectiveFrom, now), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, now))))
    .orderBy(asc(hrPayrollRules.sortOrder), asc(hrPayrollRules.id));
}
export async function activePortalDocumentPolicies(db: DatabaseExecutor, now = new Date()): Promise<PortalPolicy[]> {
  return db.select(getTableColumns(hrPayrollRules)).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId))
    .where(and(eq(hrPayrollRules.category, "PORTAL"), eq(hrPayrollRules.valueType, "JSON"), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.status, "ATIVA"), lte(hrPayrollRuleSets.effectiveFrom, now), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, now))))
    .orderBy(asc(hrPayrollRules.name), asc(hrPayrollRules.id));
}
export async function activePortalTotalsPolicy(db: DatabaseExecutor, id: string, now = new Date()): Promise<PortalPolicy | null> {
  const [row] = await db.select(getTableColumns(hrPayrollRules)).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId))
    .where(and(eq(hrPayrollRules.id, id), eq(hrPayrollRules.category, "PORTAL"), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.status, "ATIVA"), lte(hrPayrollRuleSets.effectiveFrom, now), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, now)))).limit(1);
  return row ?? null;
}
export async function portalPolicy(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ rule: hrPayrollRules, ruleSet: hrPayrollRuleSets }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(eq(hrPayrollRules.id, id)).limit(1);
  return row ? { ...row.rule, ruleSet: row.ruleSet } : null;
}
export async function requiredPortalPolicy(db: DatabaseExecutor, id: string) {
  const row = await portalPolicy(db, id);
  if (!row) throw new Error("Registro não encontrado.");
  return row;
}
export async function portalEvents(db: DatabaseExecutor, condition: SQL, order: SQL = sql`"createdAt" DESC, id ASC`): Promise<PortalIntegrationEvent[]> {
  return portalRows<PortalIntegrationEvent>(db, sql`SELECT * FROM "HrIntegrationEvent" WHERE ${condition} ORDER BY ${order}`);
}
export async function portalEvent(db: DatabaseExecutor, condition: SQL): Promise<PortalIntegrationEvent | null> {
  return portalFirst<PortalIntegrationEvent>(db, sql`SELECT * FROM "HrIntegrationEvent" WHERE ${condition} LIMIT 1`);
}
export async function changePortalEvent(db: DatabaseExecutor, id: string, change: { status?: string; payload?: unknown; result?: unknown }): Promise<void> {
  const fields: SQL[] = [sql`"updatedAt"=${new Date()}`];
  if (change.status !== undefined) fields.push(sql`status=${change.status}`);
  if (change.payload !== undefined) fields.push(sql`payload=${JSON.stringify(change.payload)}::jsonb`);
  if (change.result !== undefined) fields.push(sql`result=${JSON.stringify(change.result)}::jsonb`);
  await db.execute(sql`UPDATE "HrIntegrationEvent" SET ${sql.join(fields, sql`, `)} WHERE id=${id}`);
}
export async function portalRequest(db: DatabaseExecutor, condition: SQL): Promise<PortalRequest | null> {
  return portalFirst<PortalRequest>(db, sql`SELECT * FROM "HrPortalRequest" WHERE ${condition} LIMIT 1`);
}
export async function requiredPortalRequest(db: DatabaseExecutor, id: string): Promise<PortalRequest> {
  const row = await portalRequest(db, sql`id=${id}`);
  if (!row) throw new Error("Registro não encontrado.");
  return row;
}
export async function insertPortalRequest(db: DatabaseExecutor, input: { employeeId: string; actorId: string; requestKey: string; kind: string; status?: string; payload: JsonValue }): Promise<PortalRequest> {
  const [row] = await db.insert(employeePortalRequests).values(input).returning();
  return row;
}
