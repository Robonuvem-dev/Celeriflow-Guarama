import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { constructionPortalCaseWhere } from "./construction-portal-policy";

export const constructionDocumentRequestSchema = z.object({ caseId: z.string().min(1), sourceIssuedDocumentId: z.string().min(1), requestKey: z.uuid(), type: z.enum(["CORRECTION", "RENEWAL"]), reason: z.string().trim().min(10).max(4000) });
export async function requestConstructionArtifactChange(tx: Prisma.TransactionClient, identityId: string, input: unknown) {
  const data = constructionDocumentRequestSchema.parse(input);
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionPortalCaseWhere(identityId)] }, select: { id: true, processId: true, process: { select: { currentDepartmentId: true, status: true } } } });
  if (!record || ["Cancelado", "Arquivado", "Rejeitado"].includes(record.process.status)) throw new Error("Solicitação indisponível para sua conta.");
  const existing = await tx.constructionDocumentRequest.findUnique({ where: { requestKey: data.requestKey } });
  if (existing) { if (existing.caseId !== record.id || existing.identityId !== identityId || existing.type !== data.type || existing.sourceIssuedDocumentId !== data.sourceIssuedDocumentId) throw new Error("Pedido indisponível."); return existing.id; }
  const source = await tx.constructionIssuedDocument.findFirst({ where: { id: data.sourceIssuedDocumentId, caseId: record.id, status: "PUBLISHED" } });
  if (!source || (data.type === "RENEWAL" && source.kind !== "PERMIT")) throw new Error("Selecione documento publicado; renovação é aplicável ao alvará.");
  const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true } });
  if (!term || !await tx.constructionTermAcceptance.findUnique({ where: { caseId_identityId_termId: { caseId: record.id, identityId, termId: term.id } }, select: { id: true } })) throw new Error("Aceite o termo vigente antes do pedido.");
  if (await tx.constructionDocumentRequest.findFirst({ where: { sourceIssuedDocumentId: source.id, status: "PENDING" }, select: { id: true } })) throw new Error("Já existe pedido pendente para este documento.");
  if (await tx.constructionIssuedDocument.findFirst({ where: { sourceIssuedDocumentId: source.id, status: "ISSUED" }, select: { id: true } })) throw new Error("A nova emissão deste documento aguarda assinatura e publicação.");
  const request = await tx.constructionDocumentRequest.create({ data: { ...data, identityId } });
  await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_ARTIFACT_CHANGE_REQUESTED", description: data.reason, departmentId: record.process.currentDepartmentId, metadata: JSON.stringify({ documentRequestId: request.id, sourceIssuedDocumentId: source.id, type: data.type, identityId }) } });
  return request.id;
}
