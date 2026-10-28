import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { constructionCaseProperties, constructionCases, constructionConfigVersions, constructionParticipants, constructionPortalIdentities, constructionProfessionals } from "@/db/schema/construction-core";
import { constructionExternalApplications, constructionMessages, constructionTermAcceptances, constructionTerms } from "@/db/schema/construction-portal";
import { constructionExternalDocuments } from "@/db/schema/construction-opening";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { processDocuments } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { findConstructionOpeningDocumentVersion, listConstructionOpeningCatalogs, listConstructionOpeningProperties } from "@/db/repositories/infrastructure/construction-opening";
import { constructionExternalOpeningSchema, assertExternalApplicationScope, validateExternalOpeningEvidence } from "./construction-external-policy";
import { calculateConstructionArea } from "./construction-policy";
import { definitionSchema, validateConstructionFields } from "./construction-rules";
import { createConstructionExternalProcess } from "./construction-external-process";
import { assignConstructionCase } from "./construction-distribution";
import { assertConstructionExternalCompany } from "./construction-external-company";

export async function openConstructionExternalApplication(tx: DatabaseTransaction, identityId: string, rawInput: unknown) {
  const data = constructionExternalOpeningSchema.parse(rawInput);
  await tx.execute(sql`SELECT "id" FROM "ConstructionExternalApplication" WHERE "id"=${data.applicationId} FOR UPDATE`);
  const [application] = await tx.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.id, data.applicationId), eq(constructionExternalApplications.identityId, identityId))).limit(1);
  if (!application) throw new Error("Autorização indisponível.");
  if (application.caseId) {
    const [existing] = await tx.select({ id: constructionCases.id, requestKey: constructionCases.requestKey }).from(constructionCases).where(eq(constructionCases.id, application.caseId)).limit(1);
    if (!existing) throw new Error("ConstructionCase não encontrado.");
    if (existing.requestKey !== data.requestKey) throw new Error("Esta autorização já foi protocolada. Consulte a solicitação existente.");
    return existing.id;
  }
  assertExternalApplicationScope(application, identityId, data);
  await assertConstructionExternalCompany(tx, identityId, application.companyId);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`);
  if ((await tx.select({ id: constructionCases.id }).from(constructionCases).where(eq(constructionCases.requestKey, data.requestKey)).limit(1)).length) throw new Error("Referência de abertura indisponível.");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [identity] = await tx.select({ id: constructionPortalIdentities.id, professionalType: constructionProfessionals.professionalType }).from(constructionPortalIdentities).innerJoin(constructionProfessionals, eq(constructionProfessionals.id, constructionPortalIdentities.professionalId)).innerJoin(people, eq(people.id, constructionProfessionals.personId)).where(and(eq(constructionPortalIdentities.id, identityId), eq(constructionPortalIdentities.isActive, true), eq(constructionProfessionals.isActive, true), lte(constructionProfessionals.startsAt, new Date()), or(isNull(constructionProfessionals.endsAt), gte(constructionProfessionals.endsAt, today)), eq(people.status, "Ativo"))).limit(1);
  if (!identity) throw new Error("Habilitação profissional encerrada.");
  const [config] = await tx.select().from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1);
  if (!config || config.version !== data.configurationVersion || !config.subjectIds.includes(data.subjectId)) throw new Error("Configuração/assunto alterado. Atualize a página.");
  const [form] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "FORM")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize a página.");
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  const additionalValues = validateConstructionFields(definition, data.additionalValues);
  validateExternalOpeningEvidence(definition, data.documentIds, data.checks);
  const [term] = await tx.select().from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
  if (!term || term.id !== data.termId) throw new Error("Leia e aceite o termo vigente antes de protocolar.");
  const uploadedDocuments = await tx.select().from(constructionExternalDocuments).where(eq(constructionExternalDocuments.applicationId, application.id));
  const documents = [];
  for (const [label, documentId] of Object.entries(data.documentIds)) {
    const uploaded = uploadedDocuments.find((doc) => doc.documentId === documentId && doc.label === label);
    if (!uploaded) throw new Error("Documento não pertence a esta abertura.");
    const current = await findConstructionOpeningDocumentVersion(tx, documentId);
    if (!current || current.id !== uploaded.documentVersionId || !["FINAL", "SIGNED"].includes(current.status) || current.hashSha256 !== uploaded.hashSha256) throw new Error("Documento GED alterado/inválido. Reenvie a versão atual.");
    documents.push(uploaded);
  }
  if (data.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Requerente indisponível.");
  if (data.companyId && !(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.status, "Ativo"))).limit(1)).length) throw new Error("Requerente indisponível.");
  const properties = await listConstructionOpeningProperties(tx, application.propertyIds);
  if (properties.length !== application.propertyIds.length) throw new Error("Imóvel autorizado indisponível.");
  const catalogs = await listConstructionOpeningCatalogs(tx, [data.modalityId, data.purposeId, ...(data.constructionTypeId ? [data.constructionTypeId] : [])]);
  const modality = catalogs.find((entry) => entry.id === data.modalityId && entry.kind === (data.category === "BUILDING" ? "PERMIT_TYPE" : "SUBDIVISION_TYPE"));
  const purpose = catalogs.find((entry) => entry.id === data.purposeId && entry.kind === "PURPOSE");
  const constructionType = catalogs.find((entry) => entry.id === data.constructionTypeId && entry.kind === "CONSTRUCTION_TYPE");
  if (!modality || !purpose || (data.constructionTypeId && !constructionType)) throw new Error("Modalidade, finalidade ou tipo construtivo indisponível.");
  const area = calculateConstructionArea(data, config.areaWeights);
  const process = await createConstructionExternalProcess(tx, identityId, { ...data, personId: data.personId || null, companyId: data.companyId || null });
  const [record] = await tx.insert(constructionCases).values({
    requestKey: data.requestKey, processId: process.id, configurationId: config.id, category: data.category, locationType: data.locationType, regularization: data.regularization,
    catalogSnapshot: { modality: { id: modality.id, name: modality.name }, purpose: { id: purpose.id, name: purpose.name }, constructionType: constructionType ? { id: constructionType.id, name: constructionType.name } : null },
    existingArea: new Decimal(data.existingArea), expandedArea: new Decimal(data.expandedArea), irregularArea: new Decimal(data.irregularArea), renovationArea: new Decimal(data.renovationArea), demolitionArea: new Decimal(data.demolitionArea), totalArea: new Decimal(area.total), calculationSnapshot: area.memory,
    createdBy: `EXTERNAL:${identityId}`, additionalValues, formSnapshot: { version: form?.version || 0, definition, checks: data.checks, documentIds: data.documentIds },
  }).returning({ id: constructionCases.id });
  await tx.insert(constructionCaseProperties).values(properties.map(property => ({ caseId: record.id, realEstateId: property.id, cadastralSnapshot: property })));
  await tx.insert(constructionParticipants).values({ caseId: record.id, identityId, role: identity.professionalType === "BROKER" ? "BROKER" : "TECHNICAL", reason: application.authorizationReason, createdBy: application.authorizedBy });
  await tx.insert(constructionTermAcceptances).values({ caseId: record.id, identityId, termId: term.id });
  for (const document of documents) {
    await tx.insert(processDocuments).values({ processId: process.id, documentId: document.documentId, purpose: `Abertura: ${document.label}` });
    await tx.insert(constructionMessages).values({ caseId: record.id, identityId, requestKey: document.requestKey, content: `Documento de abertura: ${document.label}`, documentId: document.documentId, evidenceSnapshot: { termId: term.id, termVersion: term.version, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256, applicationId: application.id } });
  }
  await tx.update(constructionExternalApplications).set({ caseId: record.id }).where(eq(constructionExternalApplications.id, application.id));
  if (process.currentDepartmentId) await assignConstructionCase(tx, { caseId: record.id, processId: process.id, departmentId: process.currentDepartmentId, today: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") });
  return record.id;
}
