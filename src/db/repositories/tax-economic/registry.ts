import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull, type JsonValue } from "@/db/json";
import { taxRegistryEntries as entries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import type { EconomicRegistryInput, EconomicRegistryRecord, EconomicAuditInput } from "@/lib/contracts/tax-economic";

const jsonEquals = (key: "governmentEntityId" | "budgetUnitId" | "kind" | "eventId" | "registrationId" | "policyId", value: JsonValue) => sql`${entries.data}->${key}=${JSON.stringify(value)}::jsonb`;
async function latest(database: DatabaseExecutor, predicate: SQL | undefined): Promise<EconomicRegistryRecord | null> {
  const [row] = await database.select().from(entries).where(predicate).orderBy(desc(entries.version)).limit(1);
  return row ?? null;
}
function required(row: EconomicRegistryRecord | null): EconomicRegistryRecord {
  if (!row) throw new Error("Registro econômico/documental não encontrado.");
  return row;
}
export async function lockEconomicKey(tx: DatabaseTransaction, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function appendEconomicEntry(tx: DatabaseTransaction, input: EconomicRegistryInput): Promise<EconomicRegistryRecord> {
  return (await tx.insert(entries).values({ ...input, data: input.data === null ? JsonNull : input.data }).returning())[0];
}
export async function appendEconomicAudit(tx: DatabaseTransaction, input: EconomicAuditInput): Promise<void> {
  await tx.insert(taxAuditLogs).values({ ...input, payload: input.payload === null ? JsonNull : input.payload });
}
export async function readEconomicProfile(database: DatabaseExecutor, id: string, expiry = false): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(expiry ? undefined : eq(entries.entityType, "ECONOMIC_REGISTRATION"), eq(entries.entityId, id), eq(entries.category, "ECONOMIC_PROFILE")));
}
export async function listEconomicProfiles(database: DatabaseExecutor, input: { governmentEntityId?: string; budgetUnitIds?: string[]; budgetUnitId?: string; expiry?: boolean }): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(input.expiry ? undefined : eq(entries.entityType, "ECONOMIC_REGISTRATION"), eq(entries.category, "ECONOMIC_PROFILE"), input.governmentEntityId === undefined ? undefined : jsonEquals("governmentEntityId", input.governmentEntityId), input.budgetUnitId === undefined ? undefined : jsonEquals("budgetUnitId", input.budgetUnitId), input.budgetUnitIds === undefined ? undefined : input.budgetUnitIds.length ? or(...input.budgetUnitIds.map(id => jsonEquals("budgetUnitId", id))) : sql`false`)).orderBy(desc(entries.version));
}
export async function readEconomicHistory(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "ECONOMIC_REGISTRATION"), eq(entries.entityId, id), eq(entries.category, "CADASTRAL_HISTORY")));
}
export async function listEconomicHistory(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_REGISTRATION"), eq(entries.entityId, id), eq(entries.category, "CADASTRAL_HISTORY"))).orderBy(desc(entries.version));
}
export async function listEconomicCatalogs(database: DatabaseExecutor, budgetUnitId: JsonValue, governmentEntityId?: JsonValue, kind?: string): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "FISCAL_CATALOG"), eq(entries.category, "TYPED_FISCAL_CATALOG"), jsonEquals("budgetUnitId", budgetUnitId), governmentEntityId === undefined ? undefined : jsonEquals("governmentEntityId", governmentEntityId), kind === undefined ? undefined : jsonEquals("kind", kind))).orderBy(desc(entries.version));
}
export async function listCompanySituationCatalogs(database: DatabaseExecutor): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.category, "TYPED_FISCAL_CATALOG"), jsonEquals("kind", "SITUACAO_EMPRESA"))).orderBy(desc(entries.version));
}
export async function readEconomicCatalog(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord> {
  return required(await latest(database, and(eq(entries.entityType, "FISCAL_CATALOG"), eq(entries.entityId, id), eq(entries.category, "TYPED_FISCAL_CATALOG"))));
}
export async function readEconomicAccountant(database: DatabaseExecutor, taxpayerId: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "TAXPAYER"), eq(entries.entityId, taxpayerId), eq(entries.category, "ACCOUNTANT")));
}
export async function readEconomicFiscalRecord(database: DatabaseExecutor, registrationId: string, catalogId: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "ECONOMIC_REGISTRATION"), eq(entries.entityId, registrationId), eq(entries.category, "TYPED_FISCAL_RECORD"), eq(entries.title, catalogId)));
}
export async function listEconomicFiscalRecords(database: DatabaseExecutor, ids: string[], budgetUnitIds: string[]): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_REGISTRATION"), inArray(entries.entityId, ids), eq(entries.category, "TYPED_FISCAL_RECORD"), budgetUnitIds.length ? or(...budgetUnitIds.map(id => jsonEquals("budgetUnitId", id))) : sql`false`)).orderBy(desc(entries.version));
}
export async function listEconomicActivityDefinitions(database: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_ACTIVITY"), eq(entries.category, "ECONOMIC_ACTIVITY_DEFINITION"), jsonEquals("governmentEntityId", governmentEntityId), jsonEquals("budgetUnitId", budgetUnitId))).orderBy(desc(entries.version));
}
export async function readEconomicEventTypeByTitle(database: DatabaseExecutor, title: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "ECONOMIC_EVENT_TYPE"), eq(entries.category, "ECONOMIC_EVENT_TYPE"), eq(entries.title, title)));
}
export async function readEconomicEventType(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord> {
  return required(await latest(database, and(eq(entries.entityType, "ECONOMIC_EVENT_TYPE"), eq(entries.category, "ECONOMIC_EVENT_TYPE"), eq(entries.entityId, id))));
}
export async function readEconomicEvent(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "ECONOMIC_EVENT"), eq(entries.category, "ECONOMIC_EVENT"), eq(entries.entityId, id)));
}
export async function listEconomicVehicles(database: DatabaseExecutor, budgetUnitId: string): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_VEHICLE"), eq(entries.category, "ECONOMIC_VEHICLE"), jsonEquals("budgetUnitId", budgetUnitId))).orderBy(desc(entries.version));
}
export async function readLicensePolicyByTitle(database: DatabaseExecutor, title: string): Promise<EconomicRegistryRecord | null> {
  return latest(database, and(eq(entries.entityType, "LICENSE_POLICY"), eq(entries.category, "LICENSE_POLICY"), eq(entries.title, title)));
}
export async function readLicensePolicy(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord> {
  return required(await latest(database, and(eq(entries.entityType, "LICENSE_POLICY"), eq(entries.category, "LICENSE_POLICY"), eq(entries.entityId, id))));
}
export async function listEventLicenseIssuances(database: DatabaseExecutor, eventId: string): Promise<EconomicRegistryRecord[]> {
  return database.select().from(entries).where(and(eq(entries.entityType, "LICENSE"), eq(entries.category, "LICENSE_ISSUANCE"), jsonEquals("eventId", eventId)));
}
export async function readLatestConfiguredLicenseIssuance(database: DatabaseExecutor, registrationId: string, policyId: string): Promise<EconomicRegistryRecord | null> {
  const [row] = await database.select().from(entries).where(and(eq(entries.entityType, "LICENSE"), eq(entries.category, "LICENSE_ISSUANCE"), jsonEquals("registrationId", registrationId), jsonEquals("policyId", policyId))).orderBy(desc(entries.createdAt)).limit(1);
  return row ?? null;
}
export async function readLicenseIssuance(database: DatabaseExecutor, licenseId: string): Promise<EconomicRegistryRecord> {
  const [row] = await database.select().from(entries).where(and(eq(entries.entityType, "LICENSE"), eq(entries.entityId, licenseId), eq(entries.category, "LICENSE_ISSUANCE"))).limit(1);
  return required(row ?? null);
}
export async function readLicenseSignature(database: DatabaseExecutor, licenseId: string): Promise<EconomicRegistryRecord | null> {
  const [row] = await database.select().from(entries).where(and(eq(entries.entityType, "LICENSE"), eq(entries.entityId, licenseId), eq(entries.category, "LICENSE_SIGNATURE"))).limit(1);
  return row ?? null;
}
export async function readEconomicDocumentReplay(database: DatabaseExecutor, requestKey: string): Promise<EconomicRegistryRecord | null> {
  const [row] = await database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_DOCUMENT"), eq(entries.entityId, requestKey), eq(entries.category, "ECONOMIC_DOCUMENT_ISSUANCE"))).limit(1);
  return row ?? null;
}
export async function readEconomicDocumentIssuance(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord> {
  const [row] = await database.select().from(entries).where(and(eq(entries.id, id), eq(entries.entityType, "ECONOMIC_DOCUMENT"), eq(entries.category, "ECONOMIC_DOCUMENT_ISSUANCE"))).limit(1);
  return required(row ?? null);
}
export async function readEconomicDocumentPosition(database: DatabaseExecutor, id: string): Promise<EconomicRegistryRecord> {
  const [row] = await database.select().from(entries).where(and(eq(entries.entityType, "ECONOMIC_DOCUMENT"), eq(entries.entityId, id), eq(entries.category, "ECONOMIC_DOCUMENT_POSITION"))).limit(1);
  return required(row ?? null);
}
