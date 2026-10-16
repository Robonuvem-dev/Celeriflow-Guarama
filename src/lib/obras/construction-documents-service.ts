import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { findPublicDocumentValidation, requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { assertConstructionDocumentChangeFeesSatisfied, assertConstructionFeesSatisfied } from "./construction-taxation";
import { assertConstructionCompletionReady, linkConstructionOccupancyDocument } from "./construction-lifecycle";
import { annotateConstructionPdf, assertConstructionArtifactSigned, constructionDocumentKinds, documentKindSchema, generateConstructionPdf, renderConstructionTemplate, templateSchema, templateFields } from "./construction-documents-policy";
import { backupConstructionPdf, readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function assertConstructionGedSignature(db: PrismaClient | Prisma.TransactionClient, documentVersionId: string) {
  const version = await db.documentVersion.findUniqueOrThrow({ where: { id: documentVersionId }, include: { signatures: true, icpEvidence: true, document: { select: { documentClass: { select: { signaturePolicy: true } } } } } });
  assertConstructionArtifactSigned(version, version.signatures);
  if (version.document.documentClass?.signaturePolicy === "ICP_REQUIRED") {
    if (!version.icpEvidence || !version.publicValidationCode) throw new Error("Evidência A1 obrigatória ausente.");
    const validation = await findPublicDocumentValidation(db as PrismaClient, version.publicValidationCode);
    if (!validation?.signature.valid || validation.signature.kind !== "ICP_A1_VALID") throw new Error("Assinatura A1 inválida.");
  }
  return version;
}
export const issueConstructionDocumentSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), kind: documentKindSchema, templateVersionId: z.string().min(1), completionId: z.string().default(""), documentRequestId: z.string().default(""), validUntil: z.union([z.literal(""), z.iso.date()]).default(""), signerIds: z.array(z.string().min(1)).max(20).default([]) });
function assertIssuer(access: ConstructionAccess) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Emissão e publicação exigem gestor urbanístico.");
}
async function caseForMutation(tx: Prisma.TransactionClient, access: ConstructionAccess, caseId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionCaseWhere(access)] }, include: { process: { include: { person: true, company: true } }, properties: { include: { realEstate: true } } } });
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Receba e mantenha o processo ativo para emitir documentos.");
  return record;
}
export async function publishConstructionDocumentTemplate(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  assertIssuer(access); const data = templateSchema.parse(input);
  renderConstructionTemplate(data.body, Object.fromEntries(templateFields.map((key) => [key, key])));
  renderConstructionTemplate(data.stamp, Object.fromEntries(templateFields.map((key) => [key, key])));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`construction-template:${data.kind}`}))`;
  const latest = await tx.constructionDocumentTemplateVersion.findFirst({ where: { kind: data.kind }, orderBy: { version: "desc" } });
  const row = await tx.constructionDocumentTemplateVersion.create({ data: { ...data, version: (latest?.version || 0) + 1, createdBy: actorId } });
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionDocumentTemplateVersion", targetId: row.id });
  return row.id;
}
export async function issueConstructionDocument(db: PrismaClient, access: ConstructionAccess, actorId: string, input: unknown) {
  assertIssuer(access); const data = issueConstructionDocumentSchema.parse(input);
  const issuedId = await db.$transaction(async (tx) => {
    const record = await caseForMutation(tx, access, data.caseId);
    const repeated = await tx.constructionIssuedDocument.findUnique({ where: { requestKey: data.requestKey } });
    if (repeated) { if (repeated.caseId !== data.caseId || repeated.createdBy !== actorId || repeated.kind !== data.kind) throw new Error("Chave de emissão indisponível."); return repeated.id; }
    const template = await tx.constructionDocumentTemplateVersion.findUnique({ where: { id: data.templateVersionId } });
    if (!template || template.kind !== data.kind) throw new Error("Modelo não corresponde ao documento solicitado.");
    const request = data.documentRequestId ? await tx.constructionDocumentRequest.findUnique({ where: { id: data.documentRequestId } }) : null;
    if (data.documentRequestId && (!request || request.caseId !== record.id || request.status !== "PENDING")) throw new Error("Pedido de correção ou renovação indisponível.");
    const source = request ? await tx.constructionIssuedDocument.findUnique({ where: { id: request.sourceIssuedDocumentId } }) : null;
    if (request && (!source || source.caseId !== record.id || source.kind !== data.kind || source.status !== "PUBLISHED")) throw new Error("Documento original deve estar publicado e pertencer a este processo e tipo.");
    if (!request && data.kind !== "OCCUPANCY" && await tx.constructionIssuedDocument.findFirst({ where: { caseId: record.id, kind: data.kind, status: { in: ["ISSUED", "PUBLISHED"] } } })) throw new Error("Já existe documento deste tipo. Vincule pedido de correção ou renovação.");
    const validUntil = data.validUntil ? new Date(data.validUntil + "T23:59:59Z") : null;
    if (validUntil && validUntil < new Date()) throw new Error("Validade deve ser futura.");
    if (request?.type === "RENEWAL" && (!validUntil || (source?.validUntil && validUntil <= source.validUntil))) throw new Error("Renovação deve ampliar expressamente a validade.");
    let completion = null;
    let feeEvidence: unknown = null;
    if (request) feeEvidence = await assertConstructionDocumentChangeFeesSatisfied(tx, record.id, request.id);
    if (data.kind === "VIABILITY") {
      const viability = await tx.constructionViabilityResult.findFirst({ where: { caseId: record.id }, orderBy: { createdAt: "desc" } });
      if (!viability || viability.outcome !== "APPROVED") throw new Error("Registre parecer de viabilidade favorável antes da emissão.");
    } else {
      if (record.reviewStatus !== "APPROVED") throw new Error("Documento exige projeto aprovado.");
      if (!request) feeEvidence = await assertConstructionFeesSatisfied(tx, record.id, data.kind === "PERMIT" ? (record.category === "SUBDIVISION" ? "SUBDIVISION" : "PERMIT") : "HABITE_SE");
      if (data.kind === "OCCUPANCY") {
        if (!data.completionId) throw new Error("Selecione a conclusão parcial ou total para o habite-se.");
        completion = await tx.constructionCompletion.findFirst({ where: { id: data.completionId, caseId: record.id } });
        if (!completion || (!request && completion.occupancyDocumentId)) throw new Error("Conclusão indisponível ou já possui habite-se.");
        if (source && source.completionId !== completion.id) throw new Error("Correção deve manter o vínculo à conclusão original.");
        await assertConstructionCompletionReady(tx, record.id, completion.id, request?.id);
        const permit = await tx.constructionIssuedDocument.findFirst({ where: { caseId: record.id, kind: "PERMIT", status: "PUBLISHED" } });
        if (!permit) throw new Error("Habite-se exige alvará publicado no mesmo processo.");
        await assertConstructionGedSignature(tx, permit.documentVersionId);
      }
    }
    if (data.kind !== "OCCUPANCY" && data.completionId) throw new Error("Conclusão aplicável somente ao habite-se.");
    const year = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`construction-number:${data.kind}:${year}`}))`;
    const previous = await tx.constructionIssuedDocument.findFirst({ where: { kind: data.kind, year }, orderBy: { sequence: "desc" } });
    const sequence = (previous?.sequence || 0) + 1; const number = `${data.kind}-${String(sequence).padStart(6, "0")}/${year}`; const validationCode = randomUUID().replaceAll("-", "");
    const values = { protocol: record.process.protocolNumber, number, kind: constructionDocumentKinds[data.kind], issuedAt: new Date().toISOString().slice(0, 10), totalArea: (completion?.area || record.totalArea).toString(), category: record.category, locationType: record.locationType, applicant: record.process.person?.fullName || record.process.company?.corporateName || "Requerente", properties: record.properties.map((item) => item.realEstate.municipalInsc || item.realEstateId).join(", ") };
    const bytes = await generateConstructionPdf({ title: template.title, body: renderConstructionTemplate(template.body, values), stamp: renderConstructionTemplate(template.stamp, values), validationCode, demonstration: template.signaturePolicy === "INTERNAL_ALLOWED" });
    const stored = await storeConstructionPdf(bytes, `${number.replaceAll("/", "-")}.pdf`);
    const documentClass = await tx.documentClass.upsert({ where: { code: `CONSTRUCTION_${template.signaturePolicy}` }, create: { code: `CONSTRUCTION_${template.signaturePolicy}`, label: `Construção Civil — ${template.signaturePolicy}`, signaturePolicy: template.signaturePolicy }, update: {} });
    if (!documentClass.isActive || documentClass.signaturePolicy !== template.signaturePolicy) throw new Error("Classe documental GED inativa ou incompatível.");
    const document = await tx.document.create({ data: { title: `${template.title} ${number}`, documentType: constructionDocumentKinds[data.kind], fileUrl: stored.fileUrl, documentClassId: documentClass.id, validUntil, status: "Válido", publicLabel: template.signaturePolicy === "INTERNAL_ALLOWED" ? "Construção Civil — demonstrativo interno GED" : "Construção Civil — assinatura A1 destacada" } });
    const version = await tx.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode, status: "FINAL" } });
    await tx.processDocument.create({ data: { processId: record.processId, documentId: document.id, purpose: constructionDocumentKinds[data.kind] } });
    const issued = await tx.constructionIssuedDocument.create({ data: { requestKey: data.requestKey, caseId: record.id, processId: record.processId, kind: data.kind, year, sequence, number, templateVersionId: template.id, templateSnapshot: json({ template, values, feeEvidence, completion, signerIds: data.signerIds.length ? [...new Set(data.signerIds)] : [actorId] }), documentId: document.id, documentVersionId: version.id, ...stored, validationCode, sourceIssuedDocumentId: source?.id, requestType: request?.type || "INITIAL", completionId: completion?.id, validUntil, createdBy: actorId } });
    if (request) await tx.constructionDocumentRequest.update({ where: { id: request.id }, data: { status: "FULFILLED", issuedDocumentId: issued.id } });
    if (completion && !request) await linkConstructionOccupancyDocument(tx, record.id, completion.id, document.id);
    await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_DOCUMENT_ISSUED", description: `${constructionDocumentKinds[data.kind]} ${number} emitido; aguarda assinatura e publicação.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ issuedDocumentId: issued.id, documentVersionId: version.id, hash: stored.hashSha256 }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.gedDocumentIngested, targetType: "ConstructionIssuedDocument", targetId: issued.id });
    return issued.id;
  }, { timeout: 60000 });
  if (data.kind === "OCCUPANCY") {
    const row = await db.constructionIssuedDocument.findUniqueOrThrow({ where: { id: issuedId } });
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: row.documentVersionId }, include: { document: { select: { documentClass: { select: { signaturePolicy: true } } } } } });
    if (version.status === "FINAL" && version.document.documentClass?.signaturePolicy === "INTERNAL_ALLOWED") {
      const snapshot = z.object({ signerIds: z.array(z.string()).min(1) }).passthrough().parse(row.templateSnapshot);
      await requestDocumentSignaturesForActor(db, actorId, row.documentId, snapshot.signerIds, { constructionIssuedDocumentId: row.id, demonstration: "Habite-se demonstrativo com assinatura interna GED requerida" });
    }
  }
  return issuedId;
}

export async function publishConstructionArtifact(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, issuedDocumentId: string) {
  assertIssuer(access);
  const issued = await tx.constructionIssuedDocument.findUniqueOrThrow({ where: { id: issuedDocumentId } });
  const record = await caseForMutation(tx, access, issued.caseId);
  const current = await tx.constructionIssuedDocument.findUniqueOrThrow({ where: { id: issued.id } });
  if (current.status === "PUBLISHED") return;
  if (current.status !== "ISSUED") throw new Error("Documento substituído não pode ser republicado.");
  await tx.$queryRaw`SELECT "id" FROM "DocumentVersion" WHERE "id"=${current.documentVersionId} FOR UPDATE`;
  const version = await assertConstructionGedSignature(tx, current.documentVersionId);
  if (version.documentId !== current.documentId || version.hashSha256 !== current.hashSha256 || version.fileUrl !== current.fileUrl) throw new Error("Vínculo GED diverge da emissão imutável.");
  if (current.sourceIssuedDocumentId && !await tx.constructionIssuedDocument.findFirst({ where: { id: current.sourceIssuedDocumentId, caseId: current.caseId, kind: current.kind, status: "PUBLISHED" }, select: { id: true } })) throw new Error("O documento original foi substituído por outra emissão.");
  await readConstructionPdf(current.fileUrl, current.hashSha256);
  await tx.constructionIssuedDocument.update({ where: { id: current.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  if (current.sourceIssuedDocumentId) await tx.constructionIssuedDocument.update({ where: { id: current.sourceIssuedDocumentId }, data: { status: "SUPERSEDED" } });
  if (current.completionId) await tx.constructionCompletion.update({ where: { id: current.completionId }, data: { occupancyDocumentId: current.documentId } });
  await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_DOCUMENT_PUBLISHED", description: `${current.number} assinado e publicado.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId } });
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionIssuedDocument", targetId: current.id });
}

export async function createConstructionPdfRevision(context: AppContext, access: ConstructionAccess, input: { caseId: string; documentId: string; sourceVersionId: string; requestKey: string; annotations: unknown[] }) {
  if (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role))) throw new Error("Anotações exigem analista ou gestor.");
  z.uuid().parse(input.requestKey);
  return context.prisma.$transaction(async (tx) => {
    const record = await caseForMutation(tx, access, input.caseId);
    const repeated = await tx.constructionPdfAnnotation.findUnique({ where: { requestKey: input.requestKey } });
    if (repeated) { if (repeated.caseId !== input.caseId || repeated.documentId !== input.documentId || repeated.createdBy !== context.user.id) throw new Error("Revisão indisponível."); return repeated.id; }
    if (!access.administrator && !access.roles.includes("MANAGER") && record.assignedEmployeeId !== access.employeeId) throw new Error("Anotações reservadas ao analista responsável.");
    if (await tx.constructionIssuedDocument.findUnique({ where: { documentId: input.documentId } })) throw new Error("Artefato emitido é imutável. Solicite correção vinculada.");
    if ((await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ConstructionProjectStamp" WHERE "documentId"=${input.documentId} LIMIT 1`).length) throw new Error("Cópia derivada de aprovação é imutável. Anote apenas o projeto original.");
    const link = await tx.processDocument.findFirst({ where: { processId: record.processId, documentId: input.documentId } }); if (!link) throw new Error("PDF deve pertencer ao mesmo processo.");
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id"=${input.documentId} FOR UPDATE`;
    const source = await tx.documentVersion.findFirst({ where: { documentId: input.documentId }, orderBy: { versionNumber: "desc" } });
    if (!source || source.id !== input.sourceVersionId || !["FINAL", "SIGNED"].includes(source.status)) throw new Error("A versão do projeto mudou. Atualize a página.");
    const original = await readConstructionPdf(source.fileUrl, source.hashSha256);
    await backupConstructionPdf(original);
    const revision = await annotateConstructionPdf(original, input.annotations);
    const stored = await storeConstructionPdf(revision.bytes, `projeto-revisao-${source.versionNumber + 1}.pdf`);
    // The original version, its signatures and hash remain immutable.
    const version = await tx.documentVersion.create({ data: { documentId: input.documentId, versionNumber: source.versionNumber + 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, status: "FINAL" } });
    await tx.document.update({ where: { id: input.documentId }, data: { fileUrl: stored.fileUrl, status: "Válido" } });
    const annotation = await tx.constructionPdfAnnotation.create({ data: { requestKey: input.requestKey, caseId: record.id, documentId: input.documentId, sourceVersionId: source.id, revisionVersionId: version.id, originalHash: revision.originalHash, revisionHash: stored.hashSha256, annotations: json(revision.annotations), backupPath: stored.backupPath, createdBy: context.user.id } });
    await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_PDF_ANNOTATED", description: `Revisão PDF ${version.versionNumber} com ${revision.annotations.length} anotações.`, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ annotationId: annotation.id, sourceVersionId: source.id, revisionVersionId: version.id }) } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPdfAnnotation", targetId: annotation.id });
    return annotation.id;
  }, { timeout: 60000 });
}
