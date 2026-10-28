import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, exists, getTableColumns, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { constructionCaseProperties, constructionCases, constructionCatalogEntries, constructionParticipants, constructionPortalIdentities, constructionProfessionals, constructionViabilityResults } from "@/db/schema/construction-core";
import { constructionExternalApplications, constructionStaffRoles } from "@/db/schema/construction-portal";
import { constructionAutomaticViabilityRuns, constructionDefinitionVersions, constructionPropertyZones, constructionZoneVersions } from "@/db/schema/construction-viability";
import { documentClasses, documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { documents, realEstates } from "@/db/schema/registry";
import { processes, processDocuments, processEvents } from "@/db/schema/processes";
import { employees } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { people } from "@/db/schema/people";
import { z } from "zod";
import { assertConstructionExternalCompany } from "./construction-external-company";
import { assertExternalApplicationScope } from "./construction-external-policy";
import { automaticViabilityInputSchema, evaluateAutomaticConstructionViability, generateAutomaticViabilityDraft } from "./construction-automatic-viability-policy";
import { assertConstructionGedSignature } from "./construction-documents-service";
import { readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";
import { zoneSchema } from "./construction-rules";

type Db = DatabaseTransaction;
export type ConstructionAutomaticViabilityRun = typeof constructionAutomaticViabilityRuns.$inferSelect;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

async function portalCase(tx: Db, identityId: string, caseId: string, now: Date) {
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const [identity] = await tx.select({ id: constructionPortalIdentities.id }).from(constructionPortalIdentities).innerJoin(constructionProfessionals, eq(constructionProfessionals.id, constructionPortalIdentities.professionalId)).innerJoin(people, eq(people.id, constructionProfessionals.personId))
    .where(and(eq(constructionPortalIdentities.id, identityId), eq(constructionPortalIdentities.isActive, true), inArray(constructionProfessionals.professionalType, ["ENGINEER", "ARCHITECT", "BROKER"]), eq(constructionProfessionals.isActive, true), lte(constructionProfessionals.startsAt, today), or(isNull(constructionProfessionals.endsAt), gte(constructionProfessionals.endsAt, today)), eq(people.status, "Ativo"))).limit(1);
  if (!identity) throw new Error("Habilitação profissional vigente obrigatória.");
  const [row] = await tx.select({ ...getTableColumns(constructionCases), process: getTableColumns(processes) }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId))
    .where(and(eq(constructionCases.id, caseId), exists(tx.select({ id: constructionParticipants.id }).from(constructionParticipants).where(and(eq(constructionParticipants.caseId, constructionCases.id), eq(constructionParticipants.identityId, identityId), eq(constructionParticipants.isActive, true), lte(constructionParticipants.startsAt, now), isNull(constructionParticipants.endsAt)))))).limit(1);
  const properties = row ? await tx.select({ property: constructionCaseProperties, realEstate: realEstates, constructionZone: constructionPropertyZones, zone: constructionZoneVersions }).from(constructionCaseProperties).innerJoin(realEstates, eq(realEstates.id, constructionCaseProperties.realEstateId)).leftJoin(constructionPropertyZones, eq(constructionPropertyZones.realEstateId, realEstates.id)).leftJoin(constructionZoneVersions, eq(constructionZoneVersions.id, constructionPropertyZones.zoneId)).where(eq(constructionCaseProperties.caseId, caseId)) : [];
  const record = row ? { ...row, properties: properties.map(item => ({ ...item.property, realEstate: { ...item.realEstate, constructionZone: item.constructionZone ? { ...item.constructionZone, zone: item.zone } : null } })) } : null;
  if (!record) throw new Error("Solicitação indisponível para sua conta.");
  await assertConstructionExternalCompany(tx, identityId, record.process.companyId, now);
  const [authorization] = await tx.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.caseId, caseId), eq(constructionExternalApplications.identityId, identityId))).limit(1);
  if (authorization) assertExternalApplicationScope(authorization, identityId, { personId: record.process.personId || "", companyId: record.process.companyId || "", subjectId: record.process.subjectId || "", propertyIds: record.properties.map((p) => p.realEstateId) }, now);
  return record;
}

/** The complete authorization, calculation, GED routing and event share one transaction. */
export async function runConstructionAutomaticViability(db: DatabaseConnection, identityId: string, input: unknown, now = new Date()) {
  const data = automaticViabilityInputSchema.parse(input);
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`construction-auto-viability:${data.requestKey}`}))`);
    await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
    const record = await portalCase(tx, identityId, data.caseId, now);
    const [repeated] = await tx.select().from(constructionAutomaticViabilityRuns).where(eq(constructionAutomaticViabilityRuns.requestKey, data.requestKey)).limit(1);
    if (repeated) {
      if (repeated.caseId !== data.caseId || repeated.identityId !== identityId) throw new Error("Chave de consulta indisponível.");
      return repeated.id;
    }
    if (["Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Solicitação encerrada não admite nova consulta.");
    const purpose = z.object({ purpose: z.object({ id: z.string().min(1) }) }).safeParse(record.catalogSnapshot);
    const purposeId = purpose.success ? purpose.data.purpose.id : null;
    const purposeActive = Boolean(purposeId && (await tx.select({ id: constructionCatalogEntries.id }).from(constructionCatalogEntries).where(and(eq(constructionCatalogEntries.id, purposeId), eq(constructionCatalogEntries.kind, "PURPOSE"), eq(constructionCatalogEntries.isActive, true))).limit(1))[0]);
    const properties = [];
    for (const p of record.properties) {
      const assigned = p.realEstate.constructionZone?.zone;
      // Territorial assignment supplies the code; use the latest published version effective today.
      const zone = assigned ? (await tx.select().from(constructionZoneVersions).where(and(eq(constructionZoneVersions.code, assigned.code), lte(constructionZoneVersions.startsAt, now), lte(constructionZoneVersions.publishedAt, now), or(isNull(constructionZoneVersions.endsAt), gte(constructionZoneVersions.endsAt, today(now))))).orderBy(desc(constructionZoneVersions.version)).limit(1))[0] : null;
      const normalizedRule = zone ? { ...zone, startsAt: zone.startsAt.toISOString().slice(0, 10), endsAt: zone.endsAt?.toISOString().slice(0, 10) || "", minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString() } : null;
      properties.push({ realEstateId: p.realEstateId, landArea: String(p.realEstate.landArea || 0), cadastralSnapshot: { linkedAtOpening: p.cadastralSnapshot, current: p.realEstate }, rule: normalizedRule ? { ...normalizedRule, ...zoneSchema.parse(normalizedRule) } : null });
    }
    const [viabilityDefinition] = await tx.select().from(constructionDefinitionVersions).where(and(eq(constructionDefinitionVersions.kind, "VIABILITY"), lte(constructionDefinitionVersions.publishedAt, now))).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
    const snapshot = evaluateAutomaticConstructionViability({ category: record.category, locationType: record.locationType, purposeId, purposeActive, catalogSnapshot: record.catalogSnapshot, proposedArea: record.totalArea.toString(), today: now.toISOString().slice(0, 10), properties, viabilityDefinitionSnapshot: viabilityDefinition ? { ...viabilityDefinition, publishedAt: viabilityDefinition.publishedAt.toISOString() } : null });
    const [result] = await tx.insert(constructionViabilityResults).values({ caseId: record.id, requestKey: data.requestKey, outcome: snapshot.outcome, calculationSnapshot: json(snapshot), createdBy: `CONSTRUCTION_PORTAL_IDENTITY:${identityId}` }).returning();
    const id = randomUUID();
    let documentId: string | null = null; let documentVersionId: string | null = null; let routing = "NOT_APPLICABLE";
    if (snapshot.outcome !== "MANUAL") {
      const validationCode = randomUUID().replaceAll("-", "");
      const bytes = await generateAutomaticViabilityDraft({ protocol: record.process.protocolNumber, snapshot, validationCode });
      const stored = await storeConstructionPdf(bytes, `viabilidade-demonstrativa-${id}.pdf`);
      await tx.insert(documentClasses).values({ code: "CONSTRUCTION_AUTOMATIC_VIABILITY_DEMO", label: "Viabilidade automática demonstrativa", signaturePolicy: "INTERNAL_ALLOWED" }).onConflictDoNothing({ target: documentClasses.code });
      const [documentClass] = await tx.select().from(documentClasses).where(eq(documentClasses.code, "CONSTRUCTION_AUTOMATIC_VIABILITY_DEMO")).limit(1);
      if (!documentClass.isActive || documentClass.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Classe GED demonstrativa indisponível.");
      const [document] = await tx.insert(documents).values({ title: `Viabilidade demonstrativa ${record.process.protocolNumber}`, documentType: "Consulta automática de viabilidade demonstrativa", fileUrl: stored.fileUrl, documentClassId: documentClass.id, status: "Pendente Assinatura", publicLabel: "DEMONSTRATIVO — consulta limitada, sem homologação oficial", notes: JSON.stringify({ automaticViabilityRunId: id, backupPath: stored.backupPath, identityId, actorType: "AUTOMATED_SERVICE" }) }).returning();
      const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode, status: "FINAL" }).returning();
      await tx.insert(processDocuments).values({ processId: record.processId, documentId: document.id, purpose: "Viabilidade automática demonstrativa — assinatura GED pendente" });
      documentId = document.id; documentVersionId = version.id;
      const departmentId = record.process.currentDepartmentId;
      const roles = departmentId ? await tx.select({ employeeId: constructionStaffRoles.employeeId }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).where(and(eq(constructionStaffRoles.role, "MANAGER"), eq(constructionStaffRoles.departmentId, departmentId), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today(now)), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today(now))), eq(employees.isActive, true), eq(employees.departmentId, departmentId))) : [];
      const signers = roles.length ? await tx.select({ id: users.id, employeeId: users.employeeId, nome: users.nome, email: users.email }).from(users).where(and(eq(users.ativo, true), inArray(users.employeeId, roles.map(role => role.employeeId)))) : [];
      routing = signers.length ? "REQUESTED" : "AWAITING_SIGNER_CONFIGURATION";
      if (signers.length) {
        await tx.update(documentVersions).set({ status: "PENDING_SIGNATURE", lockedAt: now }).where(eq(documentVersions.id, version.id));
        await tx.insert(documentSignatures).values(signers.map(signer => ({ documentId: document.id, documentVersionId: version.id, signerUsuarioId: signer.id, signerEmployeeId: signer.employeeId, signerName: signer.nome, signerEmail: signer.email, requestedByUsuarioId: null, documentHash: stored.hashSha256, verificationCode: randomUUID().replaceAll("-", ""), authenticationMethod: "PENDING_REAUTHENTICATION", isRequired: true, status: "PENDING", metadata: JSON.stringify({ actorType: "AUTOMATED_SERVICE", identityId, automaticViabilityRunId: id, demonstration: true }) })));
      }
    }
    await tx.insert(constructionAutomaticViabilityRuns).values({ id, requestKey: data.requestKey, caseId: record.id, identityId, outcome: snapshot.outcome, calculationSnapshot: snapshot, viabilityResultId: result.id, documentId, documentVersionId, signatureRoutingStatus: routing });
    await tx.insert(processEvents).values({ processId: record.processId, departmentId: record.process.currentDepartmentId, eventType: "CONSTRUCTION_AUTOMATIC_VIABILITY", description: `Consulta online demonstrativa: ${snapshot.outcome}; assinatura GED: ${routing}.`, metadata: JSON.stringify({ actorType: "AUTOMATED_SERVICE", requestedByIdentityId: identityId, runId: id, viabilityResultId: result.id, documentId }) });
    return id;
  }, { timeoutMs: 60000 });
}
function today(now: Date) { return new Date(now.toISOString().slice(0, 10) + "T00:00:00Z"); }

export async function listConstructionAutomaticViability(db: DatabaseConnection, identityId: string, caseId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await portalCase(tx, identityId, caseId, new Date());
    // Storage URLs, filesystem backup paths and identities are never sent to the portal.
    const rows = await tx.select().from(constructionAutomaticViabilityRuns).where(eq(constructionAutomaticViabilityRuns.caseId, caseId)).orderBy(desc(constructionAutomaticViabilityRuns.createdAt)).limit(20);
    const result = [];
    for (const row of rows) {
      let downloadable = false;
      if (row.documentVersionId) { try { await assertConstructionGedSignature(tx, row.documentVersionId); downloadable = true; } catch { /* Pending/rejected signatures stay blocked. */ } }
      result.push({ id: row.id, outcome: row.outcome, calculationSnapshot: row.calculationSnapshot, signatureRoutingStatus: row.signatureRoutingStatus, documentId: row.documentId, createdAt: row.createdAt.toISOString(), downloadable });
    }
    return result;
  });
}

export async function downloadConstructionAutomaticViability(db: DatabaseConnection, identityId: string, caseId: string, runId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await portalCase(tx, identityId, caseId, new Date());
    const [row] = await tx.select().from(constructionAutomaticViabilityRuns).where(and(eq(constructionAutomaticViabilityRuns.id, runId), eq(constructionAutomaticViabilityRuns.caseId, caseId))).limit(1);
    if (!row?.documentVersionId || !row.documentId) throw new Error("Documento indisponível.");
    const [document] = await tx.select({ status: documents.status }).from(documents).where(eq(documents.id, row.documentId)).limit(1);
    if (!document || ["Cancelado", "CANCELLED", "Vencido", "SUPERSEDED"].includes(document.status)) throw new Error("Documento indisponível.");
    const version = await assertConstructionGedSignature(tx, row.documentVersionId);
    if (version.documentId !== row.documentId) throw new Error("Vínculo GED inválido.");
    return { bytes: await readConstructionPdf(version.fileUrl, version.hashSha256), hash: version.hashSha256, filename: `viabilidade-demonstrativa-${row.id}.pdf` };
  });
}
