import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { departments, employees } from "@/db/schema/administration";
import { constructionCases } from "@/db/schema/construction-core";
import { constructionInternalOpeningDocuments } from "@/db/schema/construction-opening";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { documentVersions } from "@/db/schema/document-workflow";
import { processDocuments, processEvents } from "@/db/schema/processes";
import { documents } from "@/db/schema/registry";
import { findConstructionOpeningDocumentVersion } from "@/db/repositories/infrastructure/construction-opening";
import { z } from "zod";
import { constructionCaseSchema, type ConstructionAccess } from "./construction-policy";
import { definitionSchema } from "./construction-rules";
import { validateExternalOpeningEvidence } from "./construction-external-policy";

export const constructionInternalOpeningSchema = constructionCaseSchema.and(z.object({ documentIds: z.record(z.string(), z.string().min(1)).default({}), checks: z.record(z.string(), z.boolean()).default({}) }));
export const constructionInternalUploadSchema = z.object({ requestKey: z.uuid(), uploadKey: z.uuid(), formVersion: z.number().int().nonnegative(), label: z.string().trim().min(2).max(160) });
export type ConstructionInternalStagedDocument = { id: string; requestKey: string; uploadKey: string; actorId: string; formVersion: number; label: string; documentId: string; documentVersionId: string; hashSha256: string; filename: string; mimeType: string; caseId: string | null; createdAt: Date };

export async function assertConstructionInternalOpeningActor(tx: DatabaseTransaction, access: ConstructionAccess) {
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role)))) throw new Error("Abertura e preparação documental exigem analista/gestor vinculado a servidor ativo.");
  const [employee] = await tx.select({ id: employees.id, departmentId: employees.departmentId }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, access.employeeId), eq(employees.isActive, true), eq(departments.isActive, true))).limit(1);
  if (!employee?.departmentId || (!access.administrator && employee.departmentId !== access.departmentId)) throw new Error("Servidor/setor indisponível para abertura interna.");
  if (!access.administrator) {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (!(await tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).where(and(eq(constructionStaffRoles.employeeId, employee.id), eq(constructionStaffRoles.departmentId, employee.departmentId), inArray(constructionStaffRoles.role, ["ANALYST", "MANAGER"]), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today)))).limit(1)).length) throw new Error("Papel urbanístico encerrado. Atualize seu vínculo.");
  }
  return employee;
}

// Parameterized SQL keeps the opening-key lock explicit and supports staging before a Process exists.
export async function stageConstructionInternalDocument(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, rawInput: unknown, file: { fileUrl: string; hashSha256: string; filename: string; mimeType: string }) {
  const data = constructionInternalUploadSchema.parse(rawInput);
  z.object({ fileUrl: z.string().min(1), hashSha256: z.string().regex(/^[a-f0-9]{64}$/), filename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]) }).parse(file);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_INTERNAL_UPLOAD:${data.uploadKey}`}))`);
  await assertConstructionInternalOpeningActor(tx, access);
  const repeated = await tx.select().from(constructionInternalOpeningDocuments).where(eq(constructionInternalOpeningDocuments.uploadKey, data.uploadKey));
  if (repeated[0]) {
    const existing = repeated[0];
    if (existing.actorId !== actorId || existing.requestKey !== data.requestKey || existing.label !== data.label || existing.formVersion !== data.formVersion || existing.hashSha256 !== file.hashSha256) throw new Error("Referência de envio indisponível ou conteúdo alterado.");
    return { id: existing.documentId, created: false };
  }
  if ((await tx.select({ id: constructionCases.id }).from(constructionCases).where(eq(constructionCases.requestKey, data.requestKey)).limit(1)).length) throw new Error("Abertura já protocolada. Envie complementos no processo.");
  const [form] = await tx.select({ version: constructionDefinitionVersions.version, definition: constructionDefinitionVersions.definition }).from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "FORM")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize antes de enviar documentos.");
  if (!definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] }).documents.some((document) => document.label === data.label)) throw new Error("Categoria documental não prevista no formulário de abertura.");
  const [document] = await tx.insert(documents).values({ title: data.label, documentType: "Documento de abertura urbanística interna", fileUrl: file.fileUrl, status: "Válido" }).returning({ id: documents.id });
  const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: file.fileUrl, hashSha256: file.hashSha256, status: "FINAL" }).returning({ id: documentVersions.id });
  await tx.insert(constructionInternalOpeningDocuments).values({ ...data, id: randomUUID(), actorId, documentId: document.id, documentVersionId: version.id, hashSha256: file.hashSha256, filename: file.filename, mimeType: file.mimeType });
  return { id: document.id, created: true };
}

/** Caller holds CONSTRUCTION_OPEN lock. Only documents staged by this actor for this exact opening can be consumed. */
export async function validateConstructionInternalOpeningDocuments(tx: DatabaseTransaction, actorId: string, input: { requestKey: string; formVersion: number; documentIds: Record<string, string>; checks: Record<string, boolean> }, definition: unknown) {
  validateExternalOpeningEvidence(definition, input.documentIds, input.checks);
  const ids = Object.values(input.documentIds);
  if (ids.length !== new Set(ids).size) throw new Error("Cada categoria exige seu próprio documento preparado.");
  const staged = await tx.select().from(constructionInternalOpeningDocuments).where(and(eq(constructionInternalOpeningDocuments.actorId, actorId), eq(constructionInternalOpeningDocuments.requestKey, input.requestKey), isNull(constructionInternalOpeningDocuments.caseId))).for("update");
  const selected: ConstructionInternalStagedDocument[] = [];
  for (const [label, documentId] of Object.entries(input.documentIds)) {
    const item = staged.find((document) => document.documentId === documentId && document.label === label && document.formVersion === input.formVersion);
    if (!item) throw new Error("Documento não foi preparado por sua conta para esta abertura, versão e categoria.");
    const current = await findConstructionOpeningDocumentVersion(tx, documentId, true);
    if (!current || current.id !== item.documentVersionId || !["FINAL", "SIGNED"].includes(current.status) || current.hashSha256 !== item.hashSha256) throw new Error("Documento GED alterado, vencido ou já vinculado. Reenvie a versão atual.");
    selected.push(item);
  }
  return selected;
}

export async function linkConstructionInternalOpeningDocuments(tx: DatabaseTransaction, actorId: string, requestKey: string, caseId: string, processId: string, selected: ConstructionInternalStagedDocument[]) {
  const [record] = await tx.select({ id: constructionCases.id }).from(constructionCases).where(and(eq(constructionCases.id, caseId), eq(constructionCases.processId, processId), eq(constructionCases.requestKey, requestKey), eq(constructionCases.createdBy, actorId))).limit(1);
  if (!record) throw new Error("Abertura indisponível para vinculação documental.");
  for (const document of selected) {
    const consumed = await tx.update(constructionInternalOpeningDocuments).set({ caseId }).where(and(eq(constructionInternalOpeningDocuments.id, document.id), eq(constructionInternalOpeningDocuments.actorId, actorId), eq(constructionInternalOpeningDocuments.requestKey, requestKey), isNull(constructionInternalOpeningDocuments.caseId))).returning({ id: constructionInternalOpeningDocuments.id });
    if (consumed.length !== 1) throw new Error("Documento já consumido ou indisponível para esta abertura.");
    await tx.insert(processDocuments).values({ processId, documentId: document.documentId, purpose: `Abertura: ${document.label}` });
  }
  await tx.insert(processEvents).values({ processId, eventType: "CONSTRUCTION_OPENING_DOCUMENTS", description: "Documentos de abertura conferidos e vinculados ao GED.", metadata: JSON.stringify({ actorUsuarioId: actorId, caseId, requestKey, documents: selected.map((document) => ({ label: document.label, documentId: document.documentId, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256 })) }) });
}
