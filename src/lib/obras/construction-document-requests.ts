import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionDocumentRequests, constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { constructionTerms, constructionTermAcceptances } from "@/db/schema/construction-portal";
import { processEvents } from "@/db/schema/processes";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";

export const constructionDocumentRequestSchema = z.object({ caseId: z.string().min(1), sourceIssuedDocumentId: z.string().min(1), requestKey: z.uuid(), type: z.enum(["CORRECTION", "RENEWAL"]), reason: z.string().trim().min(10).max(4000) });
export async function requestConstructionArtifactChange(tx: DatabaseTransaction, identityId: string, input: unknown) {
  const data = constructionDocumentRequestSchema.parse(input);
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForPortal(tx, data.caseId, identityId);
  if (!record || ["Cancelado", "Arquivado", "Rejeitado"].includes(record.process.status)) throw new Error("Solicitação indisponível para sua conta.");
  const [existing] = await tx.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.requestKey, data.requestKey)).limit(1);
  if (existing) { if (existing.caseId !== record.id || existing.identityId !== identityId || existing.type !== data.type || existing.sourceIssuedDocumentId !== data.sourceIssuedDocumentId) throw new Error("Pedido indisponível."); return existing.id; }
  const [source] = await tx.select().from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.id, data.sourceIssuedDocumentId), eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.status, "PUBLISHED"))).limit(1);
  if (!source || (data.type === "RENEWAL" && source.kind !== "PERMIT")) throw new Error("Selecione documento publicado; renovação é aplicável ao alvará.");
  const [term] = await tx.select({ id: constructionTerms.id }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
  if (!term || !(await tx.select({ id: constructionTermAcceptances.id }).from(constructionTermAcceptances).where(and(eq(constructionTermAcceptances.caseId, record.id), eq(constructionTermAcceptances.identityId, identityId), eq(constructionTermAcceptances.termId, term.id))).limit(1)).length) throw new Error("Aceite o termo vigente antes do pedido.");
  if ((await tx.select({ id: constructionDocumentRequests.id }).from(constructionDocumentRequests).where(and(eq(constructionDocumentRequests.sourceIssuedDocumentId, source.id), eq(constructionDocumentRequests.status, "PENDING"))).limit(1)).length) throw new Error("Já existe pedido pendente para este documento.");
  if ((await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.sourceIssuedDocumentId, source.id), eq(constructionIssuedDocuments.status, "ISSUED"))).limit(1)).length) throw new Error("A nova emissão deste documento aguarda assinatura e publicação.");
  const [request] = await tx.insert(constructionDocumentRequests).values({ ...data, identityId }).returning();
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_ARTIFACT_CHANGE_REQUESTED", description: data.reason, departmentId: record.process.currentDepartmentId, metadata: JSON.stringify({ documentRequestId: request.id, sourceIssuedDocumentId: source.id, type: data.type, identityId }) });
  return request.id;
}
