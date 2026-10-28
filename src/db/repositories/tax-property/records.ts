import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull } from "@/db/json";
import { Decimal } from "@/db/decimal";
import { createId } from "@/db/ids";
import { realEstates, taxpayers, companies, documents } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { processes } from "@/db/schema/processes";
import { neighborhoods, streets } from "@/db/schema/localities";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { taxes, taxAssessments } from "@/db/schema/taxation-core";
import { pageValuations } from "@/db/schema/taxation-pages";
import type { PropertyValuationRow, TaxRow } from "@/lib/contracts/taxation-pages";
import type { PropertyAuditInput, PropertyCreateInput, PropertyMutation, PropertyRecord, PropertyRegistryInput, PropertyRegistryRecord } from "./contracts";

export async function propertyOriginExists(database: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string): Promise<boolean> {
  return (await database.select({ id: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), eq(planningEntityUnits.budgetUnitId, budgetUnitId))).limit(1)).length > 0;
}
export async function readProperty(database: DatabaseExecutor, id: string): Promise<PropertyRecord> {
  const [row] = await database.select().from(realEstates).where(eq(realEstates.id, id)).limit(1);
  if (!row) throw new Error("Imóvel não encontrado.");
  return row;
}
export async function lockProperty(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.select({ id: realEstates.id }).from(realEstates).where(eq(realEstates.id, id)).for("update");
}
export async function lockPropertyKey(tx: DatabaseTransaction, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function readPropertyRegistryEntry(database: DatabaseExecutor, id: string): Promise<PropertyRegistryRecord> {
  const [row] = await database.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1);
  if (!row) throw new Error("Registro fiscal não encontrado.");
  return row;
}
export async function readLatestPropertyProfile(database: DatabaseExecutor, propertyId: string): Promise<PropertyRegistryRecord | null> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), eq(taxRegistryEntries.category, "PROPERTY_PROFILE"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function readPropertyRegistrationPolicy(database: DatabaseExecutor, budgetUnitId: string): Promise<PropertyRegistryRecord | null> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "BUDGET_UNIT"), eq(taxRegistryEntries.entityId, budgetUnitId), eq(taxRegistryEntries.category, "PROPERTY_REGISTRATION_POLICY"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function readPropertyOwnership(database: DatabaseExecutor, propertyId: string): Promise<PropertyRegistryRecord | null> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), eq(taxRegistryEntries.category, "FISCAL_OWNERSHIP"), eq(taxRegistryEntries.status, "ATIVO"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function listPropertyProfileChildren(database: DatabaseExecutor, parentId: string): Promise<{ entityId: string }[]> {
  return database.select({ entityId: taxRegistryEntries.entityId }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "PROPERTY_PROFILE"), sql`${taxRegistryEntries.data}->'parentId'=${JSON.stringify(parentId)}::jsonb`));
}
export async function listMunicipalPropertyProfiles(database: DatabaseExecutor, budgetUnitId: string, governmentEntityId?: string): Promise<PropertyRegistryRecord[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.category, "PROPERTY_PROFILE"), sql`${taxRegistryEntries.data}->'budgetUnitId'=${JSON.stringify(budgetUnitId)}::jsonb`, governmentEntityId === undefined ? undefined : sql`${taxRegistryEntries.data}->'governmentEntityId'=${JSON.stringify(governmentEntityId)}::jsonb`)).orderBy(desc(taxRegistryEntries.version));
}
export async function listPropertyCatalogs(database: DatabaseExecutor, budgetUnitId: string, governmentEntityId?: string, kind?: string): Promise<PropertyRegistryRecord[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "FISCAL_CATALOG"), eq(taxRegistryEntries.category, "TYPED_FISCAL_CATALOG"), sql`${taxRegistryEntries.data}->'budgetUnitId'=${JSON.stringify(budgetUnitId)}::jsonb`, governmentEntityId === undefined ? undefined : sql`${taxRegistryEntries.data}->'governmentEntityId'=${JSON.stringify(governmentEntityId)}::jsonb`, kind === undefined ? undefined : sql`${taxRegistryEntries.data}->'kind'=${JSON.stringify(kind)}::jsonb`)).orderBy(desc(taxRegistryEntries.version));
}
export async function readPropertyCatalog(database: DatabaseExecutor, catalogId: string): Promise<PropertyRegistryRecord> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "FISCAL_CATALOG"), eq(taxRegistryEntries.entityId, catalogId), eq(taxRegistryEntries.category, "TYPED_FISCAL_CATALOG"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  if (!row) throw new Error("Catálogo fiscal não encontrado.");
  return row;
}
export async function listPropertyFiscalRecords(database: DatabaseExecutor, propertyIds: string[]): Promise<PropertyRegistryRecord[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), inArray(taxRegistryEntries.entityId, propertyIds), eq(taxRegistryEntries.category, "TYPED_FISCAL_RECORD"))).orderBy(desc(taxRegistryEntries.version));
}
export async function listPropertyCopyCharacteristics(database: DatabaseExecutor, propertyId: string): Promise<PropertyRegistryRecord[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), inArray(taxRegistryEntries.category, ["BCI", "AREA", "CARACTERISTICA", "ATRIBUTO", "TYPED_FISCAL_RECORD", "ENDERECO", "PROPRIETARIO", "PARTICIPACAO", "FISCAL_OWNERSHIP", "UNIDADE"]))).orderBy(desc(taxRegistryEntries.version), desc(taxRegistryEntries.createdAt));
}
export async function appendPropertyRegistryEntry(tx: DatabaseTransaction, input: PropertyRegistryInput): Promise<PropertyRegistryRecord> {
  const [row] = await tx.insert(taxRegistryEntries).values({ ...input, data: input.data === null ? JsonNull : input.data }).returning();
  return row;
}
export async function closePropertyOwnership(tx: DatabaseTransaction, id: string, effectiveUntil: Date): Promise<void> {
  await tx.update(taxRegistryEntries).set({ status: "HISTORICO", effectiveUntil }).where(eq(taxRegistryEntries.id, id));
}
export async function appendPropertyAudit(tx: DatabaseTransaction, input: PropertyAuditInput): Promise<void> {
  await tx.insert(taxAuditLogs).values(input);
}
export async function insertProperty(tx: DatabaseTransaction, input: PropertyCreateInput): Promise<PropertyRecord> {
  return (await tx.insert(realEstates).values(input).returning())[0];
}
export async function mutateProperty(tx: DatabaseTransaction, id: string, input: PropertyMutation): Promise<PropertyRecord> {
  if (!Object.values(input).some(value => value !== undefined)) return readProperty(tx, id);
  const [row] = await tx.update(realEstates).set(input).where(eq(realEstates.id, id)).returning();
  if (!row) throw new Error("Imóvel não encontrado.");
  return row;
}
export function propertySelectionPredicate(filter: { query?: string; streetId?: string | null; neighborhoodId?: string | null; status?: string; propertyUse?: string }, ids?: string[]): SQL | undefined {
  return and(ids === undefined ? undefined : inArray(realEstates.id, ids), filter.query ? or(ilike(realEstates.municipalInsc, `%${filter.query}%`), ilike(realEstates.registration, `%${filter.query}%`), ilike(realEstates.streetName, `%${filter.query}%`)) : undefined, filter.streetId ? eq(realEstates.streetId, filter.streetId) : undefined, filter.neighborhoodId ? eq(realEstates.neighborhoodId, filter.neighborhoodId) : undefined, filter.status ? eq(realEstates.status, filter.status) : undefined, filter.propertyUse ? eq(realEstates.propertyUse, filter.propertyUse) : undefined);
}
export async function listSelectedProperties(database: DatabaseExecutor, predicate: SQL | undefined, order: "id" | "inscription" = "id"): Promise<PropertyRecord[]> {
  return database.select().from(realEstates).where(predicate).orderBy(order === "id" ? asc(realEstates.id) : asc(realEstates.municipalInsc));
}
export async function listPropertyOwners(database: DatabaseExecutor, ids: string[]): Promise<{ id: string; person: { fullName: string } | null; company: { corporateName: string } | null }[]> {
  return database.select({ id: taxpayers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(inArray(taxpayers.id, ids), eq(taxpayers.status, "Ativo")));
}
export async function propertyTaxpayerExists(database: DatabaseExecutor, id: string): Promise<boolean> {
  return (await database.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.id, id)).limit(1)).length > 0;
}
export async function propertyProcessExists(database: DatabaseExecutor, id: string): Promise<boolean> {
  return (await database.select({ id: processes.id }).from(processes).where(eq(processes.id, id)).limit(1)).length > 0;
}
export async function propertyStreetExists(database: DatabaseExecutor, id: string): Promise<boolean> {
  return (await database.select({ id: streets.id }).from(streets).where(eq(streets.id, id)).limit(1)).length > 0;
}
export async function propertyNeighborhoodExists(database: DatabaseExecutor, id: string): Promise<boolean> {
  return (await database.select({ id: neighborhoods.id }).from(neighborhoods).where(eq(neighborhoods.id, id)).limit(1)).length > 0;
}
export async function countValidPropertyDocuments(database: DatabaseExecutor, ids: string[]): Promise<number> {
  return (await database.select({ count: sql<number>`count(*)::integer` }).from(documents).where(and(inArray(documents.id, ids), eq(documents.status, "Válido"))))[0].count;
}
export async function readPropertyTax(database: DatabaseExecutor, id: string): Promise<TaxRow> {
  const [row] = await database.select().from(taxes).where(eq(taxes.id, id)).limit(1);
  if (!row) throw new Error("Tributo não encontrado.");
  return row;
}
export async function readLatestPropertyValuationRule(database: DatabaseExecutor, taxId: string, category: string, title: string): Promise<PropertyRegistryRecord | null> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX"), eq(taxRegistryEntries.entityId, taxId), eq(taxRegistryEntries.category, category), eq(taxRegistryEntries.title, title))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function readPropertyValuationMemory(database: DatabaseExecutor, propertyId: string, category: string, match: { year: number } | { valuationId: string }): Promise<PropertyRegistryRecord | null> {
  const [row] = await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), eq(taxRegistryEntries.category, category), "year" in match ? eq(taxRegistryEntries.title, String(match.year)) : sql`${taxRegistryEntries.data}->'valuationId'=${JSON.stringify(match.valuationId)}::jsonb`)).orderBy(desc(taxRegistryEntries.version)).limit(1);
  return row ?? null;
}
export async function readAnnualPropertyValuation(database: DatabaseExecutor, realEstateId: string, year: number): Promise<PropertyValuationRow | null> {
  const [row] = await database.select().from(pageValuations).where(and(eq(pageValuations.realEstateId, realEstateId), eq(pageValuations.year, year))).limit(1);
  return row ?? null;
}
export async function saveAnnualPropertyValuation(tx: DatabaseTransaction, input: { realEstateId: string; year: number; landUnitValue: string; constructionUnitValue: string; venalValueDecimal: Decimal; source: string; notes: string }): Promise<PropertyValuationRow> {
  const values = { ...input, landUnitValue: new Decimal(input.landUnitValue), constructionUnitValue: new Decimal(input.constructionUnitValue) };
  const now = new Date();
  return (await tx.insert(pageValuations).values({ ...values, id: createId(), createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [pageValuations.realEstateId, pageValuations.year], set: { landUnitValue: values.landUnitValue, constructionUnitValue: values.constructionUnitValue, venalValueDecimal: values.venalValueDecimal, source: values.source, notes: values.notes, updatedAt: now } }).returning())[0];
}
export async function hasPropertyAssessment(database: DatabaseExecutor, input: { ids?: string[]; taxId?: string; year?: number; assessmentId?: string }): Promise<boolean> {
  return (await database.select({ id: taxAssessments.id }).from(taxAssessments).where(and(ne(taxAssessments.status, "Cancelado"), input.ids === undefined ? undefined : inArray(taxAssessments.realEstateId, input.ids), input.taxId === undefined ? undefined : eq(taxAssessments.taxId, input.taxId), input.year === undefined ? undefined : eq(taxAssessments.year, input.year), input.assessmentId === undefined ? undefined : eq(taxAssessments.id, input.assessmentId))).limit(1)).length > 0;
}
export async function listPropertyAssessedSimulations(database: DatabaseExecutor, year: number, propertyId?: string): Promise<PropertyRegistryRecord[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.category, "PROPERTY_SIMULATION_ASSESSMENT"), sql`${taxRegistryEntries.data}->'year'=${JSON.stringify(year)}::jsonb`, propertyId === undefined ? undefined : sql`${taxRegistryEntries.data}->'propertyIds' @> ${JSON.stringify([propertyId])}::jsonb`));
}
