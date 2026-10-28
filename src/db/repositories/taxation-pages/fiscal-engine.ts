import { and, asc, desc, eq, inArray, ne, notLike, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { economicRegistrations, taxAssessments } from "@/db/schema/taxation-core";
import { realEstates } from "@/db/schema/registry";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { planningCatalogEntries, planningCatalogVersions } from "@/db/schema/planning-catalog";
import { pageAssessmentScope } from "./assessments";
import { listPageTaxpayers } from "./registry";
import type { TaxpayerDetails } from "@/lib/contracts/registry";
import type { FiscalEntry } from "@/lib/contracts/taxation-pages";
import type { JsonValue } from "@/db/json";

export async function readPageAssessmentIds(database: DatabaseExecutor, allowedBudgetUnitIds: string[]): Promise<string[]> {
  return (await database.select({ id: taxAssessments.id }).from(taxAssessments).where(pageAssessmentScope(allowedBudgetUnitIds))).map(row => row.id);
}
export async function readEngineTaxpayers(database: DatabaseExecutor): Promise<(TaxpayerDetails & { realEstates: { id: string; municipalInsc: string | null }[]; economicRegistrations: { id: string; municipalInsc: string }[] })[]> {
  const taxpayers = await listPageTaxpayers(database, { active: true, order: "created-desc", limit: 300 });
  const ids = taxpayers.map(row => row.id);
  const [properties, registrations] = await Promise.all([
    database.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, taxpayerId: realEstates.taxpayerId }).from(realEstates).where(inArray(realEstates.taxpayerId, ids)),
    database.select({ id: economicRegistrations.id, municipalInsc: economicRegistrations.municipalInsc, taxpayerId: economicRegistrations.taxpayerId }).from(economicRegistrations).where(inArray(economicRegistrations.taxpayerId, ids)),
  ]);
  return taxpayers.map(row => ({ ...row, realEstates: properties.filter(property => property.taxpayerId === row.id).map(({ id, municipalInsc }) => ({ id, municipalInsc })), economicRegistrations: registrations.filter(registration => registration.taxpayerId === row.id).map(({ id, municipalInsc }) => ({ id, municipalInsc })) }));
}
function registryScope(allowedBudgetUnitIds?: string[]) {
  return allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`${taxRegistryEntries.data}->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
}
export async function readPageCreditEvents(database: DatabaseExecutor, assessmentIds?: string[]): Promise<FiscalEntry[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.category, "CREDIT_EVENT"), eq(taxRegistryEntries.status, "ATIVO"), assessmentIds ? inArray(taxRegistryEntries.entityId, assessmentIds) : undefined)).orderBy(asc(taxRegistryEntries.createdAt));
}
export async function readPageCollectionAgreements(database: DatabaseExecutor): Promise<FiscalEntry[]> {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "COLLECTION_AGREEMENT"), eq(taxRegistryEntries.category, "AGREEMENT"), eq(taxRegistryEntries.status, "ATIVO"))).orderBy(asc(taxRegistryEntries.title));
}
export async function readPageReversibleMovements(database: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<FiscalEntry[]> {
  return database.select().from(taxRegistryEntries).where(and(registryScope(allowedBudgetUnitIds), or(and(eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"), eq(taxRegistryEntries.status, "EFETIVADO")), and(eq(taxRegistryEntries.category, "REFUND_REQUEST"), inArray(taxRegistryEntries.status, ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA", "RESTITUIDA"]))))).orderBy(desc(taxRegistryEntries.createdAt)).limit(200);
}
export async function readPageAccountingProfiles(database: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<FiscalEntry[]> {
  return database.select().from(taxRegistryEntries).where(and(registryScope(allowedBudgetUnitIds), eq(taxRegistryEntries.entityType, "TAX"), inArray(taxRegistryEntries.category, ["ACCOUNTING_PROFILE", "DEBT_ACCOUNTING_PROFILE"]), eq(taxRegistryEntries.status, "ATIVO"))).orderBy(asc(taxRegistryEntries.entityId), desc(taxRegistryEntries.version));
}
export async function readPagePublishedAccounts(database: DatabaseExecutor): Promise<{ id: string; label: string; entries: { id: string; canonicalId: string; code: string; name: string; attributes: JsonValue }[] }[]> {
  const versions = await database.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.status, "PUBLISHED")).orderBy(desc(planningCatalogVersions.year));
  const entries = await database.select().from(planningCatalogEntries).where(and(inArray(planningCatalogEntries.versionId, versions.map(row => row.id)), eq(planningCatalogEntries.kind, "ACCOUNT"), ne(planningCatalogEntries.canonicalId, ""), notLike(planningCatalogEntries.canonicalId, "UNMAPPED:%"))).orderBy(asc(planningCatalogEntries.code));
  return versions.map(row => ({ ...row, entries: entries.filter(entry => entry.versionId === row.id) }));
}
export async function readPageFinancialLabels(database: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<{ bankAccounts: { id: string; bankName: string; agency: string; accountNumber: string }[]; revenueNatures: { id: string; code: string; name: string }[]; resourceSources: { id: string; code: string; name: string }[] }> {
  const scope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`"budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const [banks, revenues, resources] = await Promise.all([
    database.execute<{ id: string; bankName: string; agency: string; accountNumber: string }>(sql`SELECT id,"bankName",agency,"accountNumber" FROM "BankAccount" WHERE "isActive"=true AND ${scope} ORDER BY "bankName" ASC`),
    database.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM "RevenueNature" ORDER BY code ASC`),
    database.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM "ResourceSource" ORDER BY code ASC`),
  ]);
  return { bankAccounts: banks.rows, revenueNatures: revenues.rows, resourceSources: resources.rows };
}
