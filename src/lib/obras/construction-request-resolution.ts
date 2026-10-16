import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";

export const constructionRequestResolutionSchema = z.object({ id: z.string().min(1), decision: z.enum(["ACCEPTED", "REJECTED"]), resolution: z.string().trim().min(10).max(4000), lifecycleRecordId: z.string().default("") });

/** A request is fulfilled only by linking an actual municipal act; this grants no external staff privileges. */
export async function resolveConstructionServiceRequest(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionRequestResolutionSchema.parse(input);
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role)))) throw new Error("Atendimento exige analista ou gestor urbanístico vigente.");
  const request = await tx.constructionServiceRequest.findUnique({ where: { id: data.id } });
  if (!request) throw new Error("Pedido indisponível.");
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${request.caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: request.caseId }, constructionCaseWhere(access)] }, select: { id: true, processId: true, process: { select: { currentDepartmentId: true } } } });
  if (!record) throw new Error("Pedido indisponível no seu setor.");
  const current = await tx.constructionServiceRequest.findUniqueOrThrow({ where: { id: data.id } });
  if (current.status !== "PENDING") {
    if (current.status === data.decision && current.resolvedBy === actorId) return current.id;
    throw new Error("Pedido já atendido ou reenviado. Atualize a página.");
  }
  let fulfilledRecordId: string | null = null;
  const payload = current.payload as Record<string, Prisma.InputJsonValue>;
  if (data.decision === "ACCEPTED") {
    if (current.kind === "START") {
      const start = await tx.constructionLifecycleStart.findFirst({ where: { id: data.lifecycleRecordId, caseId: record.id, createdAt: { gte: current.createdAt } }, select: { id: true } });
      fulfilledRecordId = start?.id || null;
    } else if (current.kind === "INSPECTION") {
      const inspection = await tx.constructionInspection.findFirst({ where: { id: data.lifecycleRecordId, caseId: record.id, requestedAt: { gte: current.createdAt } }, select: { id: true } });
      fulfilledRecordId = inspection?.id || null;
    } else if (current.kind === "COMPLETION") {
      const completion = await tx.constructionCompletion.findFirst({ where: { id: data.lifecycleRecordId, caseId: record.id, createdAt: { gte: current.createdAt } }, select: { id: true } });
      fulfilledRecordId = completion?.id || null;
    } else if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(current.kind) && typeof payload.documentRequestId === "string") {
      const renewal = await tx.constructionDocumentRequest.findFirst({ where: { id: payload.documentRequestId, caseId: record.id, status: "FULFILLED", issuedDocumentId: { not: null } }, select: { issuedDocumentId: true } });
      fulfilledRecordId = renewal?.issuedDocumentId || null;
    }
    if (!fulfilledRecordId) throw new Error("Registre o ato municipal correspondente neste caso antes de concluir o pedido. Renovação exige emissão vinculada ao pedido documental.");
  } else if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(current.kind) && typeof payload.documentRequestId === "string") {
    const renewal = await tx.constructionDocumentRequest.findUnique({ where: { id: payload.documentRequestId } });
    if (renewal?.status !== "PENDING") throw new Error("Renovação documental já atendida.");
    await tx.constructionDocumentRequest.update({ where: { id: renewal.id }, data: { status: "REJECTED" } });
  }
  await tx.constructionServiceRequest.update({ where: { id: current.id }, data: { status: data.decision, resolvedAt: new Date(), resolvedBy: actorId, resolution: data.resolution, payload: { ...payload, fulfilledRecordId } } });
  await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_EXTERNAL_REQUEST_RESOLVED", description: data.resolution, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ serviceRequestId: current.id, kind: current.kind, decision: data.decision, fulfilledRecordId }) } });
  return current.id;
}
