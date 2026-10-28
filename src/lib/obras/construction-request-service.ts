import { and, desc, eq, exists, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionCases } from "@/db/schema/construction-core";
import { constructionMessages, constructionServiceRequests, constructionStaffRoles, constructionTerms, constructionTermAcceptances } from "@/db/schema/construction-portal";
import { constructionDocumentRequests, constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { documents as gedDocuments } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { employees } from "@/db/schema/administration";
import { processDocuments, processes, processEvents } from "@/db/schema/processes";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { constructionServiceRequestSchema, assertConstructionRequestState } from "./construction-request-policy";
import { validateConstructionFields, definitionSchema } from "./construction-rules";
import { assertConstructionExternalCompany } from "./construction-external-company";
import { assertConstructionInspectionRequestDeadline } from "./construction-lifecycle-deadlines";

export async function submitConstructionServiceRequest(tx: DatabaseTransaction, identityId: string, input: unknown) {
  const data = constructionServiceRequestSchema.parse(input);
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForPortal(tx, data.caseId, identityId);
  if (!record) throw new Error("Solicitação indisponível para sua conta.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_REQUEST:${data.requestKey}`}))`);
  const [existing] = await tx.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.requestKey, data.requestKey)).limit(1);
  if (existing) {
    if (existing.caseId !== record.id || existing.identityId !== identityId || existing.kind !== data.kind) throw new Error("Referência de pedido indisponível.");
    return existing.id;
  }
  assertConstructionRequestState(data, record);
  if (data.kind === "INSPECTION") await assertConstructionInspectionRequestDeadline(tx, record.id);
  await assertConstructionExternalCompany(tx, identityId, record.process.companyId);
  const [term] = await tx.select({ id: constructionTerms.id, version: constructionTerms.version }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
  if (!term || term.id !== data.termId || !(await tx.select({ id: constructionTermAcceptances.id }).from(constructionTermAcceptances).where(and(eq(constructionTermAcceptances.caseId, record.id), eq(constructionTermAcceptances.identityId, identityId), eq(constructionTermAcceptances.termId, term.id))).limit(1)).length) throw new Error("Leia e aceite o termo vigente antes do pedido.");
  if ((await tx.select({ id: constructionServiceRequests.id }).from(constructionServiceRequests).where(and(eq(constructionServiceRequests.caseId, record.id), eq(constructionServiceRequests.kind, data.kind), eq(constructionServiceRequests.status, "PENDING"))).limit(1)).length) throw new Error("Já há um pedido deste serviço aguardando atendimento.");
  const shared = data.documentIds.length ? await tx.select({ documentId: constructionMessages.documentId }).from(constructionMessages).where(and(eq(constructionMessages.caseId, record.id), inArray(constructionMessages.documentId, data.documentIds))) : [];
  const sharedIds = new Set(shared.flatMap((message) => message.documentId ? [message.documentId] : []));
  if (data.documentIds.some((id) => !sharedIds.has(id))) throw new Error("Vincule apenas documentos compartilhados na comunicação do portal deste caso.");
  const eligible = data.documentIds.length ? await tx.select({ id: gedDocuments.id }).from(gedDocuments).where(and(inArray(gedDocuments.id, data.documentIds), inArray(gedDocuments.status, ["Válido", "Assinado"]), or(isNull(gedDocuments.validUntil), gte(gedDocuments.validUntil, new Date())), exists(tx.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, gedDocuments.id), eq(processDocuments.processId, record.processId)))))) : [];
  const versions = eligible.length ? await tx.select({ documentId: documentVersions.documentId, id: documentVersions.id, versionNumber: documentVersions.versionNumber, status: documentVersions.status, hashSha256: documentVersions.hashSha256 }).from(documentVersions).where(inArray(documentVersions.documentId, eligible.map(document => document.id))).orderBy(desc(documentVersions.versionNumber)) : [];
  const documents = eligible.map(document => ({ ...document, versions: versions.filter(version => version.documentId === document.id).slice(0, 1).map(version => ({ id: version.id, versionNumber: version.versionNumber, status: version.status, hashSha256: version.hashSha256 })) }));
  if (documents.length !== data.documentIds.length || documents.some((doc) => !doc.versions[0] || !["FINAL", "SIGNED"].includes(doc.versions[0].status))) throw new Error("Documentos devem possuir versão GED vigente e pertencer a este processo.");
  const resubmit = ["READJUSTMENT", "CORRECTION"].includes(data.kind);
  let fields: Record<string, string> = {};
  if (resubmit) {
    if (!data.documentIds.length) throw new Error("Vincule ao menos um documento atualizado para reenviar o projeto.");
    const snapshot = record.formSnapshot as { definition?: unknown };
    fields = validateConstructionFields(definitionSchema.parse(snapshot.definition || { fields: [], checks: [], documents: [] }), data.additionalValues);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const [analyst] = record.firstAnalystId ? await tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).where(and(eq(constructionStaffRoles.employeeId, record.firstAnalystId), eq(constructionStaffRoles.departmentId, record.process.currentDepartmentId || ""), inArray(constructionStaffRoles.role, ["ANALYST", "MANAGER"]), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today)), eq(employees.isActive, true), record.process.currentDepartmentId === null ? isNull(employees.departmentId) : eq(employees.departmentId, record.process.currentDepartmentId))).limit(1) : [];
    if (!analyst) throw new Error("O analista inicial precisa de vínculo vigente para receber o reenvio. Contate o setor.");
  } else if (Object.keys(data.additionalValues).length) throw new Error("Alteração de formulário é permitida somente no reenvio de projeto.");
  let documentRequestId: string | null = null;
  if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(data.kind)) {
    const [source] = await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.id, data.sourceIssuedDocumentId), eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.kind, "PERMIT"), eq(constructionIssuedDocuments.status, "PUBLISHED"))).limit(1);
    if (!source) throw new Error("Alvará publicado indisponível nesta solicitação.");
    if ((await tx.select({ id: constructionDocumentRequests.id }).from(constructionDocumentRequests).where(and(eq(constructionDocumentRequests.caseId, record.id), eq(constructionDocumentRequests.sourceIssuedDocumentId, source.id), eq(constructionDocumentRequests.status, "PENDING"))).limit(1)).length) throw new Error("Já existe pedido de emissão pendente para este alvará.");
    const [renewal] = await tx.insert(constructionDocumentRequests).values({ requestKey: data.requestKey, caseId: record.id, sourceIssuedDocumentId: source.id, type: data.kind === "RENEWAL" ? "RENEWAL" : "CORRECTION", reason: data.notes, identityId }).returning({ id: constructionDocumentRequests.id });
    documentRequestId = renewal.id;
  } else if (data.sourceIssuedDocumentId) throw new Error("Alvará de origem é utilizado somente na correção documental ou renovação.");
  const [request] = await tx.insert(constructionServiceRequests).values({ requestKey: data.requestKey, caseId: record.id, identityId, kind: data.kind, status: resubmit ? "RESUBMITTED" : "PENDING", revision: record.revisionCount, notes: data.notes, payload: { additionalValues: fields, documentIds: data.documentIds, sourceIssuedDocumentId: data.sourceIssuedDocumentId || null, documentRequestId }, evidenceSnapshot: { termId: term.id, termVersion: term.version, documents, previousValues: record.additionalValues, firstAnalystId: record.firstAnalystId } }).returning({ id: constructionServiceRequests.id });
  if (resubmit) {
    await tx.update(constructionCases).set({ reviewStatus: "RESUBMITTED", revisionCount: sql`${constructionCases.revisionCount} + 1`, assignedEmployeeId: record.firstAnalystId, correctionDeadline: null, additionalValues: fields }).where(eq(constructionCases.id, record.id));
    await tx.update(processes).set({ currentResponsibleEmployeeId: record.firstAnalystId }).where(eq(processes.id, record.processId));
  }
  await tx.insert(processEvents).values({ processId: record.processId, eventType: resubmit ? "CONSTRUCTION_RESUBMITTED" : "CONSTRUCTION_EXTERNAL_SERVICE_REQUEST", description: data.notes, departmentId: record.process.currentDepartmentId, metadata: JSON.stringify({ actorType: "CONSTRUCTION_PORTAL_IDENTITY", identityId, serviceRequestId: request.id, kind: data.kind, revision: record.revisionCount + (resubmit ? 1 : 0), returnedTo: resubmit ? record.firstAnalystId : null }) });
  return request.id;
}
