import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { databaseConnection } from "@/db/client";
import type { JsonValue } from "@/db/json";
import { z } from "zod";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { constructionCaseProperties, constructionViabilityResults } from "@/db/schema/construction-core";
import { constructionCompletions } from "@/db/schema/construction-lifecycle";
import { constructionDocumentRequests, constructionDocumentTemplateVersions, constructionIssuedDocuments, constructionPdfAnnotations, constructionProjectStamps } from "@/db/schema/construction-documents";
import { documents, realEstates } from "@/db/schema/registry";
import { documentClasses, documentVersions } from "@/db/schema/document-workflow";
import { processDocuments, processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findConstructionGedVersion } from "@/db/repositories/infrastructure/construction-documents";
import type { AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { findPublicDocumentValidation, requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import type { ConstructionAccess } from "./construction-policy";
import { assertConstructionDocumentChangeFeesSatisfied, assertConstructionFeesSatisfied } from "./construction-taxation-gates";
import { assertConstructionCompletionReady, linkConstructionOccupancyDocument } from "./construction-lifecycle";
import { annotateConstructionPdf, assertConstructionArtifactSigned, constructionDocumentKinds, documentKindSchema, generateConstructionPdf, renderConstructionTemplate, templateSchema, templateFields } from "./construction-documents-policy";
import { backupConstructionPdf, readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export async function assertConstructionGedSignature(db: DatabaseExecutor, documentVersionId: string) {
  const version = await findConstructionGedVersion(db, documentVersionId);
  assertConstructionArtifactSigned(version, version.signatures);
  if (version.document.documentClass?.signaturePolicy === "ICP_REQUIRED") {
    if (!version.icpEvidence || !version.publicValidationCode) throw new Error("Evidência A1 obrigatória ausente.");
    const validation = await findPublicDocumentValidation(db, version.publicValidationCode);
    if (!validation?.signature.valid || validation.signature.kind !== "ICP_A1_VALID") throw new Error("Assinatura A1 inválida.");
  }
  return version;
}
export const issueConstructionDocumentSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), kind: documentKindSchema, templateVersionId: z.string().min(1), completionId: z.string().default(""), documentRequestId: z.string().default(""), validUntil: z.union([z.literal(""), z.iso.date()]).default(""), signerIds: z.array(z.string().min(1)).max(20).default([]) });
function assertIssuer(access: ConstructionAccess) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Emissão e publicação exigem gestor urbanístico.");
}
async function caseForMutation(tx: DatabaseTransaction, access: ConstructionAccess, caseId: string) {
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, caseId, access);
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Receba e mantenha o processo ativo para emitir documentos.");
  const properties = await tx.select({ realEstateId: constructionCaseProperties.realEstateId, realEstate: { municipalInsc: realEstates.municipalInsc } }).from(constructionCaseProperties).innerJoin(realEstates, eq(realEstates.id, constructionCaseProperties.realEstateId)).where(eq(constructionCaseProperties.caseId, caseId));
  return { ...record, properties };
}
export async function publishConstructionDocumentTemplate(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  assertIssuer(access); const data = templateSchema.parse(input);
  renderConstructionTemplate(data.body, Object.fromEntries(templateFields.map((key) => [key, key])));
  renderConstructionTemplate(data.stamp, Object.fromEntries(templateFields.map((key) => [key, key])));
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`construction-template:${data.kind}`}))`);
  const [latest] = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.kind, data.kind)).orderBy(desc(constructionDocumentTemplateVersions.version)).limit(1);
  const [row] = await tx.insert(constructionDocumentTemplateVersions).values({ ...data, version: (latest?.version || 0) + 1, createdBy: actorId }).returning();
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionDocumentTemplateVersion", targetId: row.id });
  return row.id;
}
export async function issueConstructionDocument(db: DatabaseConnection, access: ConstructionAccess, actorId: string, input: unknown) {
  assertIssuer(access); const data = issueConstructionDocumentSchema.parse(input);
  const issuedId = await withDatabaseTransaction(db, async (tx) => {
    const record = await caseForMutation(tx, access, data.caseId);
    const [repeated] = await tx.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.requestKey, data.requestKey)).limit(1);
    if (repeated) { if (repeated.caseId !== data.caseId || repeated.createdBy !== actorId || repeated.kind !== data.kind) throw new Error("Chave de emissão indisponível."); return repeated.id; }
    const [template] = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.id, data.templateVersionId)).limit(1);
    if (!template || template.kind !== data.kind) throw new Error("Modelo não corresponde ao documento solicitado.");
    const [request] = data.documentRequestId ? await tx.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, data.documentRequestId)).limit(1) : [];
    if (data.documentRequestId && (!request || request.caseId !== record.id || request.status !== "PENDING")) throw new Error("Pedido de correção ou renovação indisponível.");
    const [source] = request ? await tx.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, request.sourceIssuedDocumentId)).limit(1) : [];
    if (request && (!source || source.caseId !== record.id || source.kind !== data.kind || source.status !== "PUBLISHED")) throw new Error("Documento original deve estar publicado e pertencer a este processo e tipo.");
    if (!request && data.kind !== "OCCUPANCY" && (await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.kind, data.kind), inArray(constructionIssuedDocuments.status, ["ISSUED", "PUBLISHED"]))).limit(1)).length) throw new Error("Já existe documento deste tipo. Vincule pedido de correção ou renovação.");
    const validUntil = data.validUntil ? new Date(data.validUntil + "T23:59:59Z") : null;
    if (validUntil && validUntil < new Date()) throw new Error("Validade deve ser futura.");
    if (request?.type === "RENEWAL" && (!validUntil || (source?.validUntil && validUntil <= source.validUntil))) throw new Error("Renovação deve ampliar expressamente a validade.");
    let completion: typeof constructionCompletions.$inferSelect | null = null;
    let feeEvidence: unknown = null;
    if (request) feeEvidence = await assertConstructionDocumentChangeFeesSatisfied(tx, record.id, request.id);
    if (data.kind === "VIABILITY") {
      const [viability] = await tx.select().from(constructionViabilityResults).where(eq(constructionViabilityResults.caseId, record.id)).orderBy(desc(constructionViabilityResults.createdAt)).limit(1);
      if (!viability || viability.outcome !== "APPROVED") throw new Error("Registre parecer de viabilidade favorável antes da emissão.");
    } else {
      if (record.reviewStatus !== "APPROVED") throw new Error("Documento exige projeto aprovado.");
      if (!request) feeEvidence = await assertConstructionFeesSatisfied(tx, record.id, data.kind === "PERMIT" ? (record.category === "SUBDIVISION" ? "SUBDIVISION" : "PERMIT") : "HABITE_SE");
      if (data.kind === "OCCUPANCY") {
        if (!data.completionId) throw new Error("Selecione a conclusão parcial ou total para o habite-se.");
        const [selectedCompletion] = await tx.select().from(constructionCompletions).where(and(eq(constructionCompletions.id, data.completionId), eq(constructionCompletions.caseId, record.id))).limit(1);
        completion = selectedCompletion ?? null;
        if (!completion || (!request && completion.occupancyDocumentId)) throw new Error("Conclusão indisponível ou já possui habite-se.");
        if (source && source.completionId !== completion.id) throw new Error("Correção deve manter o vínculo à conclusão original.");
        await assertConstructionCompletionReady(tx, record.id, completion.id, request?.id);
        const [permit] = await tx.select().from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.kind, "PERMIT"), eq(constructionIssuedDocuments.status, "PUBLISHED"))).limit(1);
        if (!permit) throw new Error("Habite-se exige alvará publicado no mesmo processo.");
        await assertConstructionGedSignature(tx, permit.documentVersionId);
      }
    }
    if (data.kind !== "OCCUPANCY" && data.completionId) throw new Error("Conclusão aplicável somente ao habite-se.");
    const year = new Date().getUTCFullYear();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`construction-number:${data.kind}:${year}`}))`);
    const [previous] = await tx.select().from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.kind, data.kind), eq(constructionIssuedDocuments.year, year))).orderBy(desc(constructionIssuedDocuments.sequence)).limit(1);
    const sequence = (previous?.sequence || 0) + 1; const number = `${data.kind}-${String(sequence).padStart(6, "0")}/${year}`; const validationCode = randomUUID().replaceAll("-", "");
    const values = { protocol: record.process.protocolNumber, number, kind: constructionDocumentKinds[data.kind], issuedAt: new Date().toISOString().slice(0, 10), totalArea: (completion?.area || record.totalArea).toString(), category: record.category, locationType: record.locationType, applicant: record.process.person?.fullName || record.process.company?.corporateName || "Requerente", properties: record.properties.map((item) => item.realEstate.municipalInsc || item.realEstateId).join(", ") };
    const bytes = await generateConstructionPdf({ title: template.title, body: renderConstructionTemplate(template.body, values), stamp: renderConstructionTemplate(template.stamp, values), validationCode, demonstration: template.signaturePolicy === "INTERNAL_ALLOWED" });
    const stored = await storeConstructionPdf(bytes, `${number.replaceAll("/", "-")}.pdf`);
    const classCode = `CONSTRUCTION_${template.signaturePolicy}`;
    await tx.insert(documentClasses).values({ code: classCode, label: `Construção Civil — ${template.signaturePolicy}`, signaturePolicy: template.signaturePolicy }).onConflictDoNothing({ target: documentClasses.code });
    const [documentClass] = await tx.select().from(documentClasses).where(eq(documentClasses.code, classCode)).limit(1);
    if (!documentClass.isActive || documentClass.signaturePolicy !== template.signaturePolicy) throw new Error("Classe documental GED inativa ou incompatível.");
    const [document] = await tx.insert(documents).values({ title: `${template.title} ${number}`, documentType: constructionDocumentKinds[data.kind], fileUrl: stored.fileUrl, documentClassId: documentClass.id, validUntil, status: "Válido", publicLabel: template.signaturePolicy === "INTERNAL_ALLOWED" ? "Construção Civil — demonstrativo interno GED" : "Construção Civil — assinatura A1 destacada" }).returning();
    const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode, status: "FINAL" }).returning();
    await tx.insert(processDocuments).values({ processId: record.processId, documentId: document.id, purpose: constructionDocumentKinds[data.kind] });
    const [issued] = await tx.insert(constructionIssuedDocuments).values({ requestKey: data.requestKey, caseId: record.id, processId: record.processId, kind: data.kind, year, sequence, number, templateVersionId: template.id, templateSnapshot: json({ template, values, feeEvidence, completion, signerIds: data.signerIds.length ? [...new Set(data.signerIds)] : [actorId] }), documentId: document.id, documentVersionId: version.id, ...stored, validationCode, sourceIssuedDocumentId: source?.id, requestType: request?.type || "INITIAL", completionId: completion?.id, validUntil, createdBy: actorId }).returning();
    if (request) await tx.update(constructionDocumentRequests).set({ status: "FULFILLED", issuedDocumentId: issued.id }).where(eq(constructionDocumentRequests.id, request.id));
    if (completion && !request) await linkConstructionOccupancyDocument(tx, record.id, completion.id, document.id);
    await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_DOCUMENT_ISSUED", description: `${constructionDocumentKinds[data.kind]} ${number} emitido; aguarda assinatura e publicação.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ issuedDocumentId: issued.id, documentVersionId: version.id, hash: stored.hashSha256 }) });
    await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.gedDocumentIngested, targetType: "ConstructionIssuedDocument", targetId: issued.id });
    return issued.id;
  }, { timeoutMs: 60000 });
  if (data.kind === "OCCUPANCY") {
    const [row] = await db.db.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, issuedId)).limit(1);
    const [version] = await db.db.select({ status: documentVersions.status, signaturePolicy: documentClasses.signaturePolicy }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(eq(documentVersions.id, row.documentVersionId)).limit(1);
    if (version.status === "FINAL" && version.signaturePolicy === "INTERNAL_ALLOWED") {
      const snapshot = z.object({ signerIds: z.array(z.string()).min(1) }).passthrough().parse(row.templateSnapshot);
      await requestDocumentSignaturesForActor(db, actorId, row.documentId, snapshot.signerIds, { constructionIssuedDocumentId: row.id, demonstration: "Habite-se demonstrativo com assinatura interna GED requerida" });
    }
  }
  return issuedId;
}

export async function publishConstructionArtifact(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, issuedDocumentId: string) {
  assertIssuer(access);
  const [issued] = await tx.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, issuedDocumentId)).limit(1);
  if (!issued) throw new Error("Documento emitido indisponível.");
  const record = await caseForMutation(tx, access, issued.caseId);
  const [current] = await tx.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, issued.id)).limit(1);
  if (current.status === "PUBLISHED") return;
  if (current.status !== "ISSUED") throw new Error("Documento substituído não pode ser republicado.");
  await tx.execute(sql`SELECT "id" FROM "DocumentVersion" WHERE "id"=${current.documentVersionId} FOR UPDATE`);
  const version = await assertConstructionGedSignature(tx, current.documentVersionId);
  if (version.documentId !== current.documentId || version.hashSha256 !== current.hashSha256 || version.fileUrl !== current.fileUrl) throw new Error("Vínculo GED diverge da emissão imutável.");
  if (current.sourceIssuedDocumentId && !(await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.id, current.sourceIssuedDocumentId), eq(constructionIssuedDocuments.caseId, current.caseId), eq(constructionIssuedDocuments.kind, current.kind), eq(constructionIssuedDocuments.status, "PUBLISHED"))).limit(1)).length) throw new Error("O documento original foi substituído por outra emissão.");
  await readConstructionPdf(current.fileUrl, current.hashSha256);
  await tx.update(constructionIssuedDocuments).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(constructionIssuedDocuments.id, current.id));
  if (current.sourceIssuedDocumentId) await tx.update(constructionIssuedDocuments).set({ status: "SUPERSEDED" }).where(eq(constructionIssuedDocuments.id, current.sourceIssuedDocumentId));
  if (current.completionId) await tx.update(constructionCompletions).set({ occupancyDocumentId: current.documentId }).where(eq(constructionCompletions.id, current.completionId));
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_DOCUMENT_PUBLISHED", description: `${current.number} assinado e publicado.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId });
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionIssuedDocument", targetId: current.id });
}

export async function createConstructionPdfRevision(context: Pick<AppContext, "user">, access: ConstructionAccess, input: { caseId: string; documentId: string; sourceVersionId: string; requestKey: string; annotations: unknown[] }, connection: DatabaseConnection = databaseConnection) {
  if (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role))) throw new Error("Anotações exigem analista ou gestor.");
  z.uuid().parse(input.requestKey);
  return withDatabaseTransaction(connection, async (tx) => {
    const record = await caseForMutation(tx, access, input.caseId);
    const [repeated] = await tx.select().from(constructionPdfAnnotations).where(eq(constructionPdfAnnotations.requestKey, input.requestKey)).limit(1);
    if (repeated) { if (repeated.caseId !== input.caseId || repeated.documentId !== input.documentId || repeated.createdBy !== context.user.id) throw new Error("Revisão indisponível."); return repeated.id; }
    if (!access.administrator && !access.roles.includes("MANAGER") && record.assignedEmployeeId !== access.employeeId) throw new Error("Anotações reservadas ao analista responsável.");
    if ((await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.documentId, input.documentId)).limit(1)).length) throw new Error("Artefato emitido é imutável. Solicite correção vinculada.");
    if ((await tx.select({ id: constructionProjectStamps.id }).from(constructionProjectStamps).where(eq(constructionProjectStamps.documentId, input.documentId)).limit(1)).length) throw new Error("Cópia derivada de aprovação é imutável. Anote apenas o projeto original.");
    const [link] = await tx.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.processId, record.processId), eq(processDocuments.documentId, input.documentId))).limit(1); if (!link) throw new Error("PDF deve pertencer ao mesmo processo.");
    await tx.execute(sql`SELECT "id" FROM "Document" WHERE "id"=${input.documentId} FOR UPDATE`);
    const [source] = await tx.select().from(documentVersions).where(eq(documentVersions.documentId, input.documentId)).orderBy(desc(documentVersions.versionNumber)).limit(1);
    if (!source || source.id !== input.sourceVersionId || !["FINAL", "SIGNED"].includes(source.status)) throw new Error("A versão do projeto mudou. Atualize a página.");
    const original = await readConstructionPdf(source.fileUrl, source.hashSha256);
    await backupConstructionPdf(original);
    const revision = await annotateConstructionPdf(original, input.annotations);
    const stored = await storeConstructionPdf(revision.bytes, `projeto-revisao-${source.versionNumber + 1}.pdf`);
    // The original version, its signatures and hash remain immutable.
    const [version] = await tx.insert(documentVersions).values({ documentId: input.documentId, versionNumber: source.versionNumber + 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, status: "FINAL" }).returning();
    await tx.update(documents).set({ fileUrl: stored.fileUrl, status: "Válido" }).where(eq(documents.id, input.documentId));
    const [annotation] = await tx.insert(constructionPdfAnnotations).values({ requestKey: input.requestKey, caseId: record.id, documentId: input.documentId, sourceVersionId: source.id, revisionVersionId: version.id, originalHash: revision.originalHash, revisionHash: stored.hashSha256, annotations: json(revision.annotations), backupPath: stored.backupPath, createdBy: context.user.id }).returning();
    await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_PDF_ANNOTATED", description: `Revisão PDF ${version.versionNumber} com ${revision.annotations.length} anotações.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ annotationId: annotation.id, sourceVersionId: source.id, revisionVersionId: version.id }) });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPdfAnnotation", targetId: annotation.id });
    return annotation.id;
  }, { timeoutMs: 60000 });
}
