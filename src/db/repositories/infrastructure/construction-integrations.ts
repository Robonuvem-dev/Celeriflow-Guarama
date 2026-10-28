import { and, desc, eq, exists, getTableColumns, gte, inArray, isNotNull, isNull, lte, notExists, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { ConstructionAccess } from "@/lib/contracts/construction";
import { constructionCaseProperties, constructionCases, constructionLifecycleStarts } from "@/db/schema/construction-core";
import { constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { constructionFederalExportItems, constructionFederalExportReceipts, constructionFederalExports, constructionPlanExtractions } from "@/db/schema/construction-integrations";
import { constructionPropertyZones, constructionZoneVersions } from "@/db/schema/construction-viability";
import { documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { people } from "@/db/schema/people";
import { processes } from "@/db/schema/processes";
import { companies, realEstates } from "@/db/schema/registry";

function caseAccessCondition(access: ConstructionAccess) {
  return access.administrator ? undefined : !access.departmentId || !access.roles.length ? sql`false` : eq(processes.currentDepartmentId, access.departmentId);
}

function exportAccessCondition(db: DatabaseExecutor, access: ConstructionAccess) {
  if (access.administrator) return undefined;
  // Preserve universal item authorization, including an empty batch. A case
  // with a null/different department must fail the nested existence check.
  return and(eq(constructionFederalExports.scope, access.departmentId || ""), notExists(
    db.select({ id: constructionFederalExportItems.id }).from(constructionFederalExportItems).where(and(
      eq(constructionFederalExportItems.exportId, constructionFederalExports.id),
      notExists(db.select({ id: constructionCases.id }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(and(eq(constructionCases.id, constructionFederalExportItems.caseId), caseAccessCondition(access)))),
    )),
  ));
}

export async function findConstructionExport(db: DatabaseExecutor, access: ConstructionAccess, id: string) {
  return (await db.select().from(constructionFederalExports).where(and(eq(constructionFederalExports.id, id), exportAccessCondition(db, access))).limit(1))[0] ?? null;
}

export async function findConstructionExportReceipt(db: DatabaseExecutor, access: ConstructionAccess, exportId: string, receiptId: string) {
  return (await db.select().from(constructionFederalExportReceipts).where(and(eq(constructionFederalExportReceipts.id, receiptId), eq(constructionFederalExportReceipts.exportId, exportId), exists(db.select({ id: constructionFederalExports.id }).from(constructionFederalExports).where(and(eq(constructionFederalExports.id, constructionFederalExportReceipts.exportId), exportAccessCondition(db, access)))))).limit(1))[0] ?? null;
}

export async function listConstructionExportCases(db: DatabaseExecutor, access: ConstructionAccess, caseIds: string[]) {
  if (!caseIds.length) return [];
  const cases = await db.select({ id: constructionCases.id, totalArea: constructionCases.totalArea, protocol: processes.protocolNumber, cpf: people.cpf, cnpj: companies.cnpj, startedAt: constructionLifecycleStarts.startedAt }).from(constructionCases)
    .innerJoin(processes, eq(processes.id, constructionCases.processId)).leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId)).leftJoin(constructionLifecycleStarts, eq(constructionLifecycleStarts.caseId, constructionCases.id))
    .where(and(inArray(constructionCases.id, caseIds), caseAccessCondition(access)));
  const properties = cases.length ? await db.select({ caseId: constructionCaseProperties.caseId, registration: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number }).from(constructionCaseProperties).innerJoin(realEstates, eq(realEstates.id, constructionCaseProperties.realEstateId)).where(inArray(constructionCaseProperties.caseId, cases.map(item => item.id))) : [];
  return cases.map(item => ({ ...item, properties: properties.filter(property => property.caseId === item.id).map(property => ({ registration: property.registration, address: property.streetName ? [property.streetName, property.number].filter(Boolean).join(", ") : null })) }));
}

export async function listConstructionExportPermits(db: DatabaseExecutor, caseIds: string[], now: Date) {
  if (!caseIds.length) return { permits: [], versions: [] };
  const permits = await db.select().from(constructionIssuedDocuments).where(and(inArray(constructionIssuedDocuments.caseId, caseIds), eq(constructionIssuedDocuments.kind, "PERMIT"), eq(constructionIssuedDocuments.status, "PUBLISHED"), isNotNull(constructionIssuedDocuments.publishedAt), lte(constructionIssuedDocuments.publishedAt, now), or(isNull(constructionIssuedDocuments.validUntil), gte(constructionIssuedDocuments.validUntil, now)))).orderBy(desc(constructionIssuedDocuments.publishedAt));
  const ids = permits.map(permit => permit.documentVersionId);
  const versions = ids.length ? await db.select().from(documentVersions).where(and(inArray(documentVersions.id, ids), eq(documentVersions.status, "SIGNED"))) : [];
  const signatures = versions.length ? await db.select().from(documentSignatures).where(inArray(documentSignatures.documentVersionId, versions.map(version => version.id))) : [];
  return { permits, versions: versions.map(version => ({ ...version, signatures: signatures.filter(signature => signature.documentVersionId === version.id) })) };
}

export async function listConstructionPlanPropertyZones(db: DatabaseExecutor, caseId: string) {
  return db.select({ realEstateId: constructionCaseProperties.realEstateId, landArea: realEstates.landArea, zone: getTableColumns(constructionZoneVersions) }).from(constructionCaseProperties)
    .innerJoin(realEstates, eq(realEstates.id, constructionCaseProperties.realEstateId)).leftJoin(constructionPropertyZones, eq(constructionPropertyZones.realEstateId, realEstates.id)).leftJoin(constructionZoneVersions, eq(constructionZoneVersions.id, constructionPropertyZones.zoneId)).where(eq(constructionCaseProperties.caseId, caseId));
}

export async function findConstructionPlanExtraction(db: DatabaseExecutor, access: ConstructionAccess, id: string) {
  return (await db.select().from(constructionPlanExtractions).where(and(eq(constructionPlanExtractions.id, id), exists(db.select({ id: constructionCases.id }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(and(eq(constructionCases.id, constructionPlanExtractions.caseId), caseAccessCondition(access)))))).limit(1))[0] ?? null;
}
