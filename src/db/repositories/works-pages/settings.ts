import { and, asc, count, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksPageAccess, WorksSearch } from "@/lib/contracts/works-pages";
import { constructionCatalogEntries as catalogs, constructionConfigVersions as configs } from "@/db/schema/construction-core";
import { constructionDefinitionVersions as definitions, constructionPropertyZones as propertyZones, constructionZoneVersions as zones } from "@/db/schema/construction-viability";
import { constructionDocumentTemplateVersions as templates } from "@/db/schema/construction-documents";
import { realEstates } from "@/db/schema/registry";
import { pageDistributions as distributions } from "@/db/schema/works-pages";
import { contains, listPageDepartments, listPageEmployees, listPageSubjects, worksPage } from "./shared";

export async function latestPageConfiguration(database: DatabaseExecutor) {
  return (await database.select().from(configs).orderBy(desc(configs.version)).limit(1))[0] ?? null;
}
export async function latestPageDefinition(database: DatabaseExecutor, kind: string) {
  return (await database.select().from(definitions).where(eq(definitions.kind, kind)).orderBy(desc(definitions.version)).limit(1))[0] ?? null;
}
export function listPageCatalogOptions(database: DatabaseExecutor, kind?: string, ordered = true) {
  const query = database.select({ id: catalogs.id, kind: catalogs.kind, name: catalogs.name }).from(catalogs).where(and(eq(catalogs.isActive, true), kind ? eq(catalogs.kind, kind) : undefined));
  return ordered ? query.orderBy(asc(catalogs.name)) : query;
}
export function listPageCatalogNames(database: DatabaseExecutor, kind: string, ordered = true) {
  const query = database.select({ id: catalogs.id, name: catalogs.name }).from(catalogs).where(and(eq(catalogs.isActive, true), eq(catalogs.kind, kind)));
  return ordered ? query.orderBy(asc(catalogs.name)) : query;
}
export async function loadPageSettings(database: DatabaseExecutor, input: WorksSearch & { kind: string }) {
  const where = and(eq(catalogs.kind, input.kind), input.q ? contains(catalogs.name, input.q) : undefined, input.status === "all" ? undefined : eq(catalogs.isActive, input.status === "active"));
  const total = (await database.select({ value: count() }).from(catalogs).where(where))[0].value;
  const page = worksPage(input.page, total);
  const [entries, config, subjects] = await Promise.all([
    database.select({ id: catalogs.id, kind: catalogs.kind, name: catalogs.name, description: catalogs.description, isActive: catalogs.isActive }).from(catalogs).where(where).orderBy(asc(catalogs.name), asc(catalogs.id)).offset((page - 1) * 20).limit(20),
    latestPageConfiguration(database), listPageSubjects(database).then(rows => rows.map(({ id, name, processType }) => ({ id, name, processType }))),
  ]);
  return { total, page, entries, config, subjects };
}
export async function loadPageTemplates(database: DatabaseExecutor, kind: string, requestedPage?: string) {
  const where = eq(templates.kind, kind);
  const total = (await database.select({ value: count() }).from(templates).where(where))[0].value;
  const page = worksPage(requestedPage, total);
  const [latest, history] = await Promise.all([
    database.select().from(templates).where(where).orderBy(desc(templates.version)).limit(1).then(rows => rows[0] ?? null),
    database.select().from(templates).where(where).orderBy(desc(templates.version)).offset((page - 1) * 20).limit(20),
  ]);
  return { total, page, latest, history };
}
export async function loadPageRules(database: DatabaseExecutor, access: WorksPageAccess, input: { tab: string; kind: string; page?: string }) {
  const distributionScope = access.administrator ? undefined : eq(distributions.departmentId, access.departmentId || "");
  const total = input.tab === "zones" ? (await database.select({ value: count() }).from(zones))[0].value
    : input.tab === "distribution" ? (await database.select({ value: count() }).from(distributions).where(distributionScope))[0].value
    : (await database.select({ value: count() }).from(definitions).where(eq(definitions.kind, input.kind)))[0].value;
  const page = worksPage(input.page, total);
  const [definitionRows, zoneRows, distributionRows, latest, purposes, properties, zoneOptions, departments, employees] = await Promise.all([
    input.tab === "definitions" ? database.select().from(definitions).where(eq(definitions.kind, input.kind)).orderBy(desc(definitions.version)).offset((page - 1) * 20).limit(20) : [],
    input.tab === "zones" ? database.select().from(zones).orderBy(desc(zones.publishedAt)).offset((page - 1) * 20).limit(20) : [],
    input.tab === "distribution" ? database.select().from(distributions).where(distributionScope).orderBy(desc(distributions.publishedAt)).offset((page - 1) * 20).limit(20) : [],
    latestPageDefinition(database, input.kind), listPageCatalogNames(database, "PURPOSE"),
    database.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, zone: { code: zones.code, version: zones.version } }).from(realEstates).leftJoin(propertyZones, eq(propertyZones.realEstateId, realEstates.id)).leftJoin(zones, eq(zones.id, propertyZones.zoneId)).orderBy(asc(realEstates.municipalInsc)).then(rows => rows.map(({ zone, ...property }) => ({ ...property, constructionZone: zone ? { zone } : null }))),
    database.select({ id: zones.id, code: zones.code, name: zones.name, version: zones.version }).from(zones).orderBy(asc(zones.code), desc(zones.version)),
    listPageDepartments(database, access), listPageEmployees(database, access),
  ]);
  return { total, page, definitions: definitionRows, zones: zoneRows, distributions: distributionRows, latest, purposes, properties, zoneOptions, departments, employees };
}
