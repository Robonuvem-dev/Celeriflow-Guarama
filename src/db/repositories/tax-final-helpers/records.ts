import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { JsonNull, type JsonValue } from "../../json";
import { taxRegistryEntries } from "../../schema/taxation-registry";
import { taxAuditLogs } from "../../schema/taxation-audit";
import { taxPayments } from "../../schema/tax-accounting";
import { taxGuides } from "../../schema/taxation-core";
import { planningEntityUnits } from "../../schema/planning-catalog";

type JsonInput = string | number | boolean | null | undefined | readonly JsonInput[] | { readonly [key: string]: JsonInput };
export function taxFinalJson(value: JsonInput): JsonValue {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(taxFinalJson);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, taxFinalJson(item)]));
}
export function requireTaxFinalRecord<T>(row: T | null | undefined, entity = "Registro"): T {
  if (row === undefined || row === null) throw new Error(`${entity} não encontrado.`);
  return row;
}
export function taxFinalRegistryPosition(entityType: string, entityId: string, category: string) {
  return and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category))!;
}
export async function firstTaxFinalRegistryEntry(db: DatabaseExecutor, condition: SQL, order: SQL[] = []) {
  return (await db.select().from(taxRegistryEntries).where(condition).orderBy(...order).limit(1))[0] ?? null;
}
export async function latestTaxFinalRegistryEntry(db: DatabaseExecutor, entityType: string, entityId: string, category: string) {
  return firstTaxFinalRegistryEntry(db, taxFinalRegistryPosition(entityType, entityId, category), [desc(taxRegistryEntries.version)]);
}
export async function insertTaxFinalRegistryEntry(tx: DatabaseTransaction, data: Omit<typeof taxRegistryEntries.$inferInsert, "data"> & { data: JsonInput }) {
  const json = taxFinalJson(data.data);
  return requireTaxFinalRecord((await tx.insert(taxRegistryEntries).values({ ...data, data: json === null ? JsonNull : json }).returning())[0]);
}
export async function auditTaxFinal(tx: DatabaseTransaction, data: Omit<typeof taxAuditLogs.$inferInsert, "payload"> & { payload?: JsonInput }) {
  const payload = data.payload === undefined ? undefined : taxFinalJson(data.payload);
  await tx.insert(taxAuditLogs).values({ ...data, payload: payload === null ? JsonNull : payload });
}
export async function lockTaxFinalKey(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function readTaxFinalEntityUnit(db: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string) {
  return (await db.select().from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), eq(planningEntityUnits.budgetUnitId, budgetUnitId))).limit(1))[0] ?? null;
}
export async function readTaxFinalConfirmedPayments(db: DatabaseExecutor, assessmentId: string) {
  return db.select({ amountPaidDecimal: taxPayments.amountPaidDecimal }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessmentId), eq(taxPayments.status, "Confirmado")));
}
