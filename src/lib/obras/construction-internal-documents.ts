import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { constructionCaseSchema, type ConstructionAccess } from "./construction-policy";
import { definitionSchema } from "./construction-rules";
import { validateExternalOpeningEvidence } from "./construction-external-policy";

export const constructionInternalOpeningSchema = constructionCaseSchema.and(z.object({ documentIds: z.record(z.string(), z.string().min(1)).default({}), checks: z.record(z.string(), z.boolean()).default({}) }));
export const constructionInternalUploadSchema = z.object({ requestKey: z.uuid(), uploadKey: z.uuid(), formVersion: z.number().int().nonnegative(), label: z.string().trim().min(2).max(160) });
export type ConstructionInternalStagedDocument = { id: string; requestKey: string; uploadKey: string; actorId: string; formVersion: number; label: string; documentId: string; documentVersionId: string; hashSha256: string; filename: string; mimeType: string; caseId: string | null; createdAt: Date };

export async function assertConstructionInternalOpeningActor(tx: Prisma.TransactionClient, access: ConstructionAccess) {
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role)))) throw new Error("Abertura e preparação documental exigem analista/gestor vinculado a servidor ativo.");
  const employee = await tx.employee.findFirst({ where: { id: access.employeeId, isActive: true, department: { isActive: true } }, select: { id: true, departmentId: true } });
  if (!employee?.departmentId || (!access.administrator && employee.departmentId !== access.departmentId)) throw new Error("Servidor/setor indisponível para abertura interna.");
  if (!access.administrator) {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (!await tx.constructionStaffRole.findFirst({ where: { employeeId: employee.id, departmentId: employee.departmentId, role: { in: ["ANALYST", "MANAGER"] }, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] }, select: { id: true } })) throw new Error("Papel urbanístico encerrado. Atualize seu vínculo.");
  }
  return employee;
}

// Parameterized SQL keeps the opening-key lock explicit and supports staging before a Process exists.
export async function stageConstructionInternalDocument(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, rawInput: unknown, file: { fileUrl: string; hashSha256: string; filename: string; mimeType: string }) {
  const data = constructionInternalUploadSchema.parse(rawInput);
  z.object({ fileUrl: z.string().min(1), hashSha256: z.string().regex(/^[a-f0-9]{64}$/), filename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]) }).parse(file);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_INTERNAL_UPLOAD:${data.uploadKey}`}))`;
  await assertConstructionInternalOpeningActor(tx, access);
  const repeated = await tx.$queryRaw<ConstructionInternalStagedDocument[]>`SELECT * FROM "ConstructionInternalOpeningDocument" WHERE "uploadKey"=${data.uploadKey}`;
  if (repeated[0]) {
    const existing = repeated[0];
    if (existing.actorId !== actorId || existing.requestKey !== data.requestKey || existing.label !== data.label || existing.formVersion !== data.formVersion || existing.hashSha256 !== file.hashSha256) throw new Error("Referência de envio indisponível ou conteúdo alterado.");
    return { id: existing.documentId, created: false };
  }
  if (await tx.constructionCase.findUnique({ where: { requestKey: data.requestKey }, select: { id: true } })) throw new Error("Abertura já protocolada. Envie complementos no processo.");
  const form = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "FORM" }, orderBy: { version: "desc" }, select: { version: true, definition: true } });
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize antes de enviar documentos.");
  if (!definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] }).documents.some((document) => document.label === data.label)) throw new Error("Categoria documental não prevista no formulário de abertura.");
  const document = await tx.document.create({ data: { title: data.label, documentType: "Documento de abertura urbanística interna", fileUrl: file.fileUrl, status: "Válido" }, select: { id: true } });
  const version = await tx.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: file.fileUrl, hashSha256: file.hashSha256, status: "FINAL" }, select: { id: true } });
  await tx.$executeRaw`INSERT INTO "ConstructionInternalOpeningDocument" ("id","requestKey","uploadKey","actorId","formVersion","label","documentId","documentVersionId","hashSha256","filename","mimeType") VALUES (${randomUUID()},${data.requestKey},${data.uploadKey},${actorId},${data.formVersion},${data.label},${document.id},${version.id},${file.hashSha256},${file.filename},${file.mimeType})`;
  return { id: document.id, created: true };
}

/** Caller holds CONSTRUCTION_OPEN lock. Only documents staged by this actor for this exact opening can be consumed. */
export async function validateConstructionInternalOpeningDocuments(tx: Prisma.TransactionClient, actorId: string, input: { requestKey: string; formVersion: number; documentIds: Record<string, string>; checks: Record<string, boolean> }, definition: unknown) {
  validateExternalOpeningEvidence(definition, input.documentIds, input.checks);
  const ids = Object.values(input.documentIds);
  if (ids.length !== new Set(ids).size) throw new Error("Cada categoria exige seu próprio documento preparado.");
  const staged = await tx.$queryRaw<ConstructionInternalStagedDocument[]>`SELECT * FROM "ConstructionInternalOpeningDocument" WHERE "actorId"=${actorId} AND "requestKey"=${input.requestKey} AND "caseId" IS NULL FOR UPDATE`;
  const selected: ConstructionInternalStagedDocument[] = [];
  for (const [label, documentId] of Object.entries(input.documentIds)) {
    const item = staged.find((document) => document.documentId === documentId && document.label === label && document.formVersion === input.formVersion);
    if (!item) throw new Error("Documento não foi preparado por sua conta para esta abertura, versão e categoria.");
    const current = await tx.document.findFirst({ where: { id: documentId, status: { in: ["Válido", "Assinado"] }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }], processDocuments: { none: {} } }, select: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, status: true, hashSha256: true } } } });
    if (current?.versions[0]?.id !== item.documentVersionId || !["FINAL", "SIGNED"].includes(current.versions[0].status) || current.versions[0].hashSha256 !== item.hashSha256) throw new Error("Documento GED alterado, vencido ou já vinculado. Reenvie a versão atual.");
    selected.push(item);
  }
  return selected;
}

export async function linkConstructionInternalOpeningDocuments(tx: Prisma.TransactionClient, actorId: string, requestKey: string, caseId: string, processId: string, selected: ConstructionInternalStagedDocument[]) {
  const record = await tx.constructionCase.findFirst({ where: { id: caseId, processId, requestKey, createdBy: actorId }, select: { id: true } });
  if (!record) throw new Error("Abertura indisponível para vinculação documental.");
  for (const document of selected) {
    const consumed = await tx.$executeRaw`UPDATE "ConstructionInternalOpeningDocument" SET "caseId"=${caseId} WHERE "id"=${document.id} AND "actorId"=${actorId} AND "requestKey"=${requestKey} AND "caseId" IS NULL`;
    if (consumed !== 1) throw new Error("Documento já consumido ou indisponível para esta abertura.");
    await tx.processDocument.create({ data: { processId, documentId: document.documentId, purpose: `Abertura: ${document.label}` }, select: { id: true } });
  }
  await tx.processEvent.create({ data: { processId, eventType: "CONSTRUCTION_OPENING_DOCUMENTS", description: "Documentos de abertura conferidos e vinculados ao GED.", metadata: JSON.stringify({ actorUsuarioId: actorId, caseId, requestKey, documents: selected.map((document) => ({ label: document.label, documentId: document.documentId, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256 })) }) }, select: { id: true } });
}
