import type { Prisma } from "@prisma/client";
import { constructionPortalCaseWhere } from "./construction-portal-policy";
import { constructionServiceRequestSchema, assertConstructionRequestState } from "./construction-request-policy";
import { validateConstructionFields, definitionSchema } from "./construction-rules";
import { assertConstructionExternalCompany } from "./construction-external-company";
import { assertConstructionInspectionRequestDeadline } from "./construction-lifecycle-deadlines";

export async function submitConstructionServiceRequest(tx: Prisma.TransactionClient, identityId: string, input: unknown) {
  const data = constructionServiceRequestSchema.parse(input);
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionPortalCaseWhere(identityId)] }, include: { process: { select: { status: true, completedAt: true, currentDepartmentId: true, companyId: true } } } });
  if (!record) throw new Error("Solicitação indisponível para sua conta.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_REQUEST:${data.requestKey}`}))`;
  const existing = await tx.constructionServiceRequest.findUnique({ where: { requestKey: data.requestKey } });
  if (existing) {
    if (existing.caseId !== record.id || existing.identityId !== identityId || existing.kind !== data.kind) throw new Error("Referência de pedido indisponível.");
    return existing.id;
  }
  assertConstructionRequestState(data, record);
  if (data.kind === "INSPECTION") await assertConstructionInspectionRequestDeadline(tx, record.id);
  await assertConstructionExternalCompany(tx, identityId, record.process.companyId);
  const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true, version: true } });
  if (!term || term.id !== data.termId || !await tx.constructionTermAcceptance.findUnique({ where: { caseId_identityId_termId: { caseId: record.id, identityId, termId: term.id } }, select: { id: true } })) throw new Error("Leia e aceite o termo vigente antes do pedido.");
  if (await tx.constructionServiceRequest.findFirst({ where: { caseId: record.id, kind: data.kind, status: "PENDING" }, select: { id: true } })) throw new Error("Já há um pedido deste serviço aguardando atendimento.");
  const shared = await tx.constructionMessage.findMany({ where: { caseId: record.id, documentId: { in: data.documentIds } }, select: { documentId: true } });
  const sharedIds = new Set(shared.flatMap((message) => message.documentId ? [message.documentId] : []));
  if (data.documentIds.some((id) => !sharedIds.has(id))) throw new Error("Vincule apenas documentos compartilhados na comunicação do portal deste caso.");
  const documents = await tx.document.findMany({ where: { id: { in: data.documentIds }, processDocuments: { some: { processId: record.processId } }, status: { in: ["Válido", "Assinado"] }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, select: { id: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, status: true, hashSha256: true } } } });
  if (documents.length !== data.documentIds.length || documents.some((doc) => !doc.versions[0] || !["FINAL", "SIGNED"].includes(doc.versions[0].status))) throw new Error("Documentos devem possuir versão GED vigente e pertencer a este processo.");
  const resubmit = ["READJUSTMENT", "CORRECTION"].includes(data.kind);
  let fields: Record<string, string> = {};
  if (resubmit) {
    if (!data.documentIds.length) throw new Error("Vincule ao menos um documento atualizado para reenviar o projeto.");
    const snapshot = record.formSnapshot as { definition?: unknown };
    fields = validateConstructionFields(definitionSchema.parse(snapshot.definition || { fields: [], checks: [], documents: [] }), data.additionalValues);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const analyst = record.firstAnalystId ? await tx.constructionStaffRole.findFirst({ where: { employeeId: record.firstAnalystId, departmentId: record.process.currentDepartmentId || "", role: { in: ["ANALYST", "MANAGER"] }, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], employee: { isActive: true, departmentId: record.process.currentDepartmentId } }, select: { id: true } }) : null;
    if (!analyst) throw new Error("O analista inicial precisa de vínculo vigente para receber o reenvio. Contate o setor.");
  } else if (Object.keys(data.additionalValues).length) throw new Error("Alteração de formulário é permitida somente no reenvio de projeto.");
  let documentRequestId: string | null = null;
  if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(data.kind)) {
    const source = await tx.constructionIssuedDocument.findFirst({ where: { id: data.sourceIssuedDocumentId, caseId: record.id, kind: "PERMIT", status: "PUBLISHED" }, select: { id: true } });
    if (!source) throw new Error("Alvará publicado indisponível nesta solicitação.");
    if (await tx.constructionDocumentRequest.findFirst({ where: { caseId: record.id, sourceIssuedDocumentId: source.id, status: "PENDING" }, select: { id: true } })) throw new Error("Já existe pedido de emissão pendente para este alvará.");
    const renewal = await tx.constructionDocumentRequest.create({ data: { requestKey: data.requestKey, caseId: record.id, sourceIssuedDocumentId: source.id, type: data.kind === "RENEWAL" ? "RENEWAL" : "CORRECTION", reason: data.notes, identityId }, select: { id: true } });
    documentRequestId = renewal.id;
  } else if (data.sourceIssuedDocumentId) throw new Error("Alvará de origem é utilizado somente na correção documental ou renovação.");
  const request = await tx.constructionServiceRequest.create({ data: { requestKey: data.requestKey, caseId: record.id, identityId, kind: data.kind, status: resubmit ? "RESUBMITTED" : "PENDING", revision: record.revisionCount, notes: data.notes, payload: { additionalValues: fields, documentIds: data.documentIds, sourceIssuedDocumentId: data.sourceIssuedDocumentId || null, documentRequestId }, evidenceSnapshot: { termId: term.id, termVersion: term.version, documents, previousValues: record.additionalValues, firstAnalystId: record.firstAnalystId } }, select: { id: true } });
  if (resubmit) {
    await tx.constructionCase.update({ where: { id: record.id }, data: { reviewStatus: "RESUBMITTED", revisionCount: { increment: 1 }, assignedEmployeeId: record.firstAnalystId, correctionDeadline: null, additionalValues: fields } });
    await tx.process.update({ where: { id: record.processId }, data: { currentResponsibleEmployeeId: record.firstAnalystId } });
  }
  await tx.processEvent.create({ data: { processId: record.processId, eventType: resubmit ? "CONSTRUCTION_RESUBMITTED" : "CONSTRUCTION_EXTERNAL_SERVICE_REQUEST", description: data.notes, departmentId: record.process.currentDepartmentId, metadata: JSON.stringify({ actorType: "CONSTRUCTION_PORTAL_IDENTITY", identityId, serviceRequestId: request.id, kind: data.kind, revision: record.revisionCount + (resubmit ? 1 : 0), returnedTo: resubmit ? record.firstAnalystId : null }) } });
  return request.id;
}
