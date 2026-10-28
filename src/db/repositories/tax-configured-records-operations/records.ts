import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull, type JsonValue } from "@/db/json";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { configuredDocuments, configuredEconomicRegistrations, configuredEntityUnits, configuredItbiDeclarations, configuredNeighborhoods, configuredProcesses, configuredProperties, configuredStreets } from "@/db/schema/tax-configured-records-operations";
import type { ConfiguredFiscalAuditInput, ConfiguredFiscalEntry, ConfiguredFiscalEntryInput, ConfiguredFiscalSubject } from "@/lib/contracts/tax-configured-records-operations";

/** Parsed catalog/record objects contain only JSON scalars, arrays and objects.
 * Omit optional undefined members, as at the original JSON serialization boundary. */
export function configuredFiscalSnapshot(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(configuredFiscalSnapshot);
  if (typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) result[key] = configuredFiscalSnapshot(item);
    return result;
  }
  throw new Error("Valor não serializável no formulário fiscal.");
}

export async function configuredFiscalOriginExists(db: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string): Promise<boolean> {
  return (await db.select({ id: configuredEntityUnits.budgetUnitId }).from(configuredEntityUnits).where(and(eq(configuredEntityUnits.governmentEntityId, governmentEntityId), eq(configuredEntityUnits.budgetUnitId, budgetUnitId))).limit(1)).length > 0;
}
export async function configuredFiscalNeighborhoodExists(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: configuredNeighborhoods.id }).from(configuredNeighborhoods).where(eq(configuredNeighborhoods.id, id)).limit(1)).length > 0;
}
export async function configuredFiscalStreetExists(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: configuredStreets.id }).from(configuredStreets).where(eq(configuredStreets.id, id)).limit(1)).length > 0;
}
export async function configuredFiscalProcessExists(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: configuredProcesses.id }).from(configuredProcesses).where(eq(configuredProcesses.id, id)).limit(1)).length > 0;
}
export async function readLatestConfiguredFiscalEntry(db: DatabaseExecutor, entityType: string, entityId: string, category: string, title?: string): Promise<ConfiguredFiscalEntry | null> {
  const [row] = await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category), title === undefined ? undefined : eq(taxRegistryEntries.title, title))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function listConfiguredFiscalCatalogCode(db: DatabaseExecutor, code: string): Promise<ConfiguredFiscalEntry[]> {
  return db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "FISCAL_CATALOG"), eq(taxRegistryEntries.category, "TYPED_FISCAL_CATALOG"), sql`${taxRegistryEntries.data}->'code'=${JSON.stringify(code)}::jsonb`));
}
export async function listConfiguredFiscalActivities(db: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string): Promise<ConfiguredFiscalEntry[]> {
  return db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "ECONOMIC_ACTIVITY"), eq(taxRegistryEntries.category, "ECONOMIC_ACTIVITY_DEFINITION"), sql`${taxRegistryEntries.data}->'governmentEntityId'=${JSON.stringify(governmentEntityId)}::jsonb`, sql`${taxRegistryEntries.data}->'budgetUnitId'=${JSON.stringify(budgetUnitId)}::jsonb`)).orderBy(desc(taxRegistryEntries.version));
}
export async function readValidConfiguredFiscalDocuments(db: DatabaseExecutor, ids: string[]): Promise<{ id: string }[]> {
  // Bind the entire array once, including [] and strings containing SQL syntax.
  return db.select({ id: configuredDocuments.id }).from(configuredDocuments).where(and(sql`${configuredDocuments.id}=ANY(${sql.param(ids)}::text[])`, eq(configuredDocuments.status, "Válido")));
}
export async function lockConfiguredFiscalKey(tx: DatabaseTransaction, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function lockConfiguredFiscalSubject(tx: DatabaseTransaction, entityType: ConfiguredFiscalSubject, id: string): Promise<JsonValue | null> {
  if (entityType === "REAL_ESTATE") {
    if (!(await tx.select({ id: configuredProperties.id }).from(configuredProperties).where(eq(configuredProperties.id, id)).for("update")).length) throw new Error("Imóvel não encontrado.");
    return null;
  }
  if (entityType === "ECONOMIC_REGISTRATION") {
    if (!(await tx.select({ id: configuredEconomicRegistrations.id }).from(configuredEconomicRegistrations).where(eq(configuredEconomicRegistrations.id, id)).for("update")).length) throw new Error("Cadastro econômico não encontrado.");
    return null;
  }
  const [row] = await tx.select({ calculationSnapshot: configuredItbiDeclarations.calculationSnapshot }).from(configuredItbiDeclarations).where(eq(configuredItbiDeclarations.id, id)).for("update");
  if (!row) throw new Error("Declaração ITBI não encontrada.");
  return row.calculationSnapshot;
}
export async function changeConfiguredFiscalPropertyStatus(tx: DatabaseTransaction, id: string, status: string, processId: string | null): Promise<void> {
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`);
  const rows = await tx.update(configuredProperties).set({ status, updatedAt: new Date() }).where(eq(configuredProperties.id, id)).returning({ id: configuredProperties.id });
  if (!rows.length) throw new Error("Imóvel não encontrado.");
}
export async function insertConfiguredFiscalEntry(tx: DatabaseTransaction, input: ConfiguredFiscalEntryInput): Promise<ConfiguredFiscalEntry> {
  const [row] = await tx.insert(taxRegistryEntries).values({ ...input, data: input.data === null ? JsonNull : input.data }).returning();
  return row;
}
export async function insertConfiguredFiscalAudit(tx: DatabaseTransaction, input: ConfiguredFiscalAuditInput): Promise<void> {
  await tx.insert(taxAuditLogs).values({ ...input, payload: input.payload === null ? JsonNull : input.payload });
}
