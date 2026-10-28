import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionLifecycleStarts } from "@/db/schema/construction-core";
import { constructionServiceRequests } from "@/db/schema/construction-portal";
import { constructionDocumentRequests } from "@/db/schema/construction-documents";
import { processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { z } from "zod";
import type { ConstructionAccess } from "./construction-policy";

export const constructionRequestResolutionSchema = z.object({ id: z.string().min(1), decision: z.enum(["ACCEPTED", "REJECTED"]), resolution: z.string().trim().min(10).max(4000), lifecycleRecordId: z.string().default("") });

/** A request is fulfilled only by linking an actual municipal act; this grants no external staff privileges. */
export async function resolveConstructionServiceRequest(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionRequestResolutionSchema.parse(input);
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role)))) throw new Error("Atendimento exige analista ou gestor urbanístico vigente.");
  const [request] = await tx.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.id, data.id)).limit(1);
  if (!request) throw new Error("Pedido indisponível.");
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${request.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, request.caseId, access);
  if (!record) throw new Error("Pedido indisponível no seu setor.");
  const [current] = await tx.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.id, data.id)).limit(1);
  if (!current) throw new Error("Pedido indisponível.");
  if (current.status !== "PENDING") {
    if (current.status === data.decision && current.resolvedBy === actorId) return current.id;
    throw new Error("Pedido já atendido ou reenviado. Atualize a página.");
  }
  let fulfilledRecordId: string | null = null;
  const payload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload : {};
  if (data.decision === "ACCEPTED") {
    if (current.kind === "START") {
      const [start] = await tx.select({ id: constructionLifecycleStarts.id }).from(constructionLifecycleStarts).where(and(eq(constructionLifecycleStarts.id, data.lifecycleRecordId), eq(constructionLifecycleStarts.caseId, record.id), gte(constructionLifecycleStarts.createdAt, current.createdAt))).limit(1);
      fulfilledRecordId = start?.id || null;
    } else if (current.kind === "INSPECTION") {
      const inspection = (await tx.execute<{ id: string }>(sql`SELECT "id" FROM "ConstructionInspection" WHERE "id"=${data.lifecycleRecordId} AND "caseId"=${record.id} AND "requestedAt">=${current.createdAt.toISOString()}::timestamp(3) LIMIT 1`)).rows[0];
      fulfilledRecordId = inspection?.id || null;
    } else if (current.kind === "COMPLETION") {
      const completion = (await tx.execute<{ id: string }>(sql`SELECT "id" FROM "ConstructionCompletion" WHERE "id"=${data.lifecycleRecordId} AND "caseId"=${record.id} AND "createdAt">=${current.createdAt.toISOString()}::timestamp(3) LIMIT 1`)).rows[0];
      fulfilledRecordId = completion?.id || null;
    } else if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(current.kind) && typeof payload.documentRequestId === "string") {
      const [renewal] = await tx.select({ issuedDocumentId: constructionDocumentRequests.issuedDocumentId }).from(constructionDocumentRequests).where(and(eq(constructionDocumentRequests.id, payload.documentRequestId), eq(constructionDocumentRequests.caseId, record.id), eq(constructionDocumentRequests.status, "FULFILLED"), isNotNull(constructionDocumentRequests.issuedDocumentId))).limit(1);
      fulfilledRecordId = renewal?.issuedDocumentId || null;
    }
    if (!fulfilledRecordId) throw new Error("Registre o ato municipal correspondente neste caso antes de concluir o pedido. Renovação exige emissão vinculada ao pedido documental.");
  } else if (["RENEWAL", "DOCUMENT_CORRECTION"].includes(current.kind) && typeof payload.documentRequestId === "string") {
    const [renewal] = await tx.select().from(constructionDocumentRequests).where(and(eq(constructionDocumentRequests.id, payload.documentRequestId), eq(constructionDocumentRequests.caseId, record.id))).limit(1);
    if (renewal?.status !== "PENDING") throw new Error("Renovação documental já atendida.");
    await tx.update(constructionDocumentRequests).set({ status: "REJECTED" }).where(eq(constructionDocumentRequests.id, renewal.id));
  }
  await tx.update(constructionServiceRequests).set({ status: data.decision, resolvedAt: new Date(), resolvedBy: actorId, resolution: data.resolution, payload: { ...payload, fulfilledRecordId } }).where(eq(constructionServiceRequests.id, current.id));
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_EXTERNAL_REQUEST_RESOLVED", description: data.resolution, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ serviceRequestId: current.id, kind: current.kind, decision: data.decision, fulfilledRecordId }) });
  return current.id;
}
