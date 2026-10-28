import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import type { JsonObject, JsonValue } from "@/db/json";
import type { TaxAnnualBatchRecord } from "@/lib/contracts/tax-annual";
import { annualBatches, annualBatchItems } from "@/db/schema/tax-annual";
import { pageBenefitRules, pageParameters, pageValuations } from "@/db/schema/taxation-pages";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { realEstates, taxpayers } from "@/db/schema/registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";

export const annualJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export const annualObject = (value: JsonValue | null | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function annualRequired<T>(value: T | undefined | null, label: string): T {
  if (!value) throw new Error(`${label} não encontrado.`);
  return value;
}

// These locks are usable only on the originating transaction, never a pooled
// executor that could release its backend between the lock and the write.
export async function lockAnnualKey(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}
export async function lockAnnualRow(tx: DatabaseTransaction, table: "TaxAnnualBatch" | "TaxParameter" | "PropertyValuation" | "Taxpayer" | "RealEstate" | "EconomicRegistration" | "TaxAssessment", id: string, mode: "SHARE" | "UPDATE") {
  await tx.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id=${id} ${mode === "SHARE" ? sql`FOR SHARE` : sql`FOR UPDATE`}`);
}
export async function readAnnualBatch(db: DatabaseExecutor, id: string): Promise<TaxAnnualBatchRecord> {
  return annualRequired((await db.select().from(annualBatches).where(eq(annualBatches.id, id)).limit(1))[0], "Lote anual");
}
export async function findAnnualBatch(db: DatabaseExecutor, entityId: string, key: string): Promise<TaxAnnualBatchRecord | null> {
  return (await db.select().from(annualBatches).where(and(eq(annualBatches.governmentEntityId, entityId), eq(annualBatches.idempotencyKey, key))).limit(1))[0] ?? null;
}
export async function countAnnualItems(db: DatabaseExecutor, batchId: string, status: string, exclude = false) {
  return (await db.select({ value: count() }).from(annualBatchItems).where(and(eq(annualBatchItems.batchId, batchId), exclude ? ne(annualBatchItems.status, status) : eq(annualBatchItems.status, status))))[0].value;
}
export async function nextAnnualItem(db: DatabaseExecutor, batchId: string) {
  return (await db.select().from(annualBatchItems).where(and(eq(annualBatchItems.batchId, batchId), eq(annualBatchItems.status, "PENDING"))).orderBy(asc(annualBatchItems.id)).limit(1))[0] ?? null;
}
export async function readAnnualValuation(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select().from(pageValuations).where(eq(pageValuations.id, id)).limit(1))[0], "Avaliação anual");
}
export async function readAnnualProperty(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select({ taxpayerId: realEstates.taxpayerId, updatedAt: realEstates.updatedAt }).from(realEstates).where(eq(realEstates.id, id)).limit(1))[0], "Imóvel");
}
export async function readAnnualRegistration(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select({ taxpayerId: economicRegistrations.taxpayerId, updatedAt: economicRegistrations.updatedAt, status: economicRegistrations.status }).from(economicRegistrations).where(eq(economicRegistrations.id, id)).limit(1))[0], "Inscrição econômica");
}
export async function readAnnualTaxpayer(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select({ status: taxpayers.status, updatedAt: taxpayers.updatedAt }).from(taxpayers).where(eq(taxpayers.id, id)).limit(1))[0], "Contribuinte");
}
export async function readAnnualParameter(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select().from(pageParameters).where(eq(pageParameters.id, id)).limit(1))[0], "Regra fiscal");
}
export async function readAnnualBenefitRule(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select().from(pageBenefitRules).where(eq(pageBenefitRules.id, id)).limit(1))[0], "Regra de benefício");
}
export async function findAnnualAudit(db: DatabaseExecutor, batchId: string, action: string, latest = false) {
  const query = db.select({ payload: taxAuditLogs.payload }).from(taxAuditLogs).where(and(eq(taxAuditLogs.entityType, "TaxAnnualBatch"), eq(taxAuditLogs.entityId, batchId), eq(taxAuditLogs.action, action)));
  return (await (latest ? query.orderBy(desc(taxAuditLogs.createdAt), desc(taxAuditLogs.id)) : query).limit(1))[0] ?? null;
}
export async function findAnnualRegistry(db: DatabaseExecutor, entityType: string, entityId: string, category: string, latest = false) {
  const query = db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category)));
  return (await (latest ? query.orderBy(desc(taxRegistryEntries.version)) : query).limit(1))[0] ?? null;
}

// Shared schema imports above are read-only. Writes explicitly bind physical
// columns here, preserving defaults, IDs and timestamps without shared edits.
export async function insertAnnualAudit(tx: DatabaseTransaction, actor: { usuarioId: string; employeeId?: string | null }, input: { entityType: string; entityId: string; action: string; payload: JsonValue }) {
  await tx.execute(sql`INSERT INTO "TaxAuditLog" (id, action, "entityType", "entityId", payload, "authorUsuarioId", "authorEmployeeId") VALUES (${createId()}, ${input.action}, ${input.entityType}, ${input.entityId}, ${JSON.stringify(input.payload)}::jsonb, ${actor.usuarioId}, ${actor.employeeId ?? null})`);
}
export async function insertAnnualRegistry(tx: DatabaseTransaction, input: { entityType: string; entityId: string; category: string; title: string; actorUsuarioId: string; data: JsonValue; version?: number }) {
  const id = createId();
  await tx.execute(sql`INSERT INTO "TaxRegistryEntry" (id, "entityType", "entityId", category, title, "actorUsuarioId", data, version, "updatedAt") VALUES (${id}, ${input.entityType}, ${input.entityId}, ${input.category}, ${input.title}, ${input.actorUsuarioId}, ${JSON.stringify(input.data)}::jsonb, ${input.version ?? 1}, ${new Date().toISOString()}::timestamp)`);
  return annualRequired((await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0], "Registro anual");
}
export async function insertAnnualParameter(tx: DatabaseTransaction, input: { taxId: string; code: string; name: string; calculationType: string; configuration: JsonValue; effectiveFrom: Date; effectiveUntil: Date }) {
  const id = createId();
  await tx.execute(sql`INSERT INTO "TaxParameter" (id, "taxId", code, name, "calculationType", configuration, "effectiveFrom", "effectiveUntil", "isActive", "updatedAt") VALUES (${id}, ${input.taxId}, ${input.code}, ${input.name}, ${input.calculationType}, ${JSON.stringify(input.configuration)}::jsonb, ${input.effectiveFrom.toISOString()}::timestamp, ${input.effectiveUntil.toISOString()}::timestamp, true, ${new Date().toISOString()}::timestamp)`);
  return readAnnualParameter(tx, id);
}
export async function insertAnnualCopyEvent(tx: DatabaseTransaction, key: string, payload: JsonValue, result: JsonValue) {
  const now = new Date().toISOString();
  await tx.execute(sql`INSERT INTO "TaxIntegrationEvent" (id, "integrationCode", "eventType", "idempotencyKey", status, "evidenceLevel", payload, result, "processedAt", "updatedAt") VALUES (${createId()}, 'FISCAL_ENGINE', 'ANNUAL_RULE_COPIED', ${key}, 'PROCESSADO', 'L1', ${JSON.stringify(payload)}::jsonb, ${JSON.stringify(result)}::jsonb, ${now}::timestamp, ${now}::timestamp)`);
}
export async function dueAnnualBatches(db: DatabaseExecutor, actorId: string, units: string[]) {
  return db.select({ id: annualBatches.id }).from(annualBatches).where(and(eq(annualBatches.actorUsuarioId, actorId), inArray(annualBatches.budgetUnitId, units), inArray(annualBatches.status, ["QUEUED", "RUNNING"]), sql`${annualBatches.scheduledAt} <= ${new Date().toISOString()}::timestamp`, sql`EXISTS (SELECT 1 FROM ${annualBatchItems} WHERE ${annualBatchItems.batchId}=${annualBatches.id} AND ${annualBatchItems.status}='PENDING')`)).orderBy(asc(annualBatches.scheduledAt), asc(annualBatches.id)).limit(10);
}
