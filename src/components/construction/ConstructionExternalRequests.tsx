import { and, asc, desc, eq, exists, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { constructionMessages, constructionServiceRequests } from "@/db/schema/construction-portal";
import { constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { documents as gedDocuments } from "@/db/schema/registry";
import { processDocuments } from "@/db/schema/processes";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionRequestKinds } from "@/lib/obras/construction-request-policy";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionServiceRequestForm from "./ConstructionServiceRequestForm";

export default async function ConstructionExternalRequests({ caseId, termId, accepted }: { caseId: string; termId: string | undefined; accepted: boolean }) {
  const identity = await getConstructionPortalIdentity();
  const record = await findConstructionCaseForPortal(db, caseId, identity.id);
  if (!record) return null;
  const shared = await db.select({ documentId: constructionMessages.documentId }).from(constructionMessages).where(and(eq(constructionMessages.caseId, caseId), isNotNull(constructionMessages.documentId))).orderBy(desc(constructionMessages.createdAt)).limit(200);
  const [requests, documents, permits] = await Promise.all([
    db.select({ id: constructionServiceRequests.id, kind: constructionServiceRequests.kind, status: constructionServiceRequests.status, notes: constructionServiceRequests.notes, createdAt: constructionServiceRequests.createdAt, resolution: constructionServiceRequests.resolution }).from(constructionServiceRequests).where(eq(constructionServiceRequests.caseId, caseId)).orderBy(desc(constructionServiceRequests.createdAt), asc(constructionServiceRequests.id)).limit(50),
    db.select({ id: gedDocuments.id, title: gedDocuments.title }).from(gedDocuments).where(and(inArray(gedDocuments.id, shared.flatMap((message) => message.documentId ? [message.documentId] : [])), exists(db.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, gedDocuments.id), eq(processDocuments.processId, record.processId)))), inArray(gedDocuments.status, ["Válido", "Assinado"]))).orderBy(asc(gedDocuments.title)).limit(200),
    db.select({ id: constructionIssuedDocuments.id, number: constructionIssuedDocuments.number }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, caseId), eq(constructionIssuedDocuments.kind, "PERMIT"), eq(constructionIssuedDocuments.status, "PUBLISHED"))).orderBy(desc(constructionIssuedDocuments.createdAt)).limit(100),
  ]);
  const snapshot = record.formSnapshot as { definition?: unknown };
  const fields = definitionSchema.parse(snapshot.definition || { fields: [], checks: [], documents: [] }).fields;
  return <section className="space-y-3"><h2 className="font-semibold">Pedidos e reenvios</h2>{accepted && termId ? <ConstructionServiceRequestForm key={`${record.revisionCount}:${termId}`} caseId={caseId} revision={record.revisionCount} reviewStatus={record.reviewStatus} termId={termId} documents={documents} permits={permits} fields={fields} values={record.additionalValues as Record<string, string>} /> : <p className="text-sm">Aceite o termo vigente para solicitar serviços.</p>}{requests.map((request) => <article key={request.id} className="rounded border p-3 text-sm"><p className="font-semibold">{constructionRequestKinds[request.kind as keyof typeof constructionRequestKinds]} — {request.status}</p><p className="text-xs">{request.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap">{request.notes}</p>{request.resolution && <p className="whitespace-pre-wrap">Resposta: {request.resolution}</p>}</article>)}{requests.length === 50 && <p className="text-xs">Exibindo os 50 pedidos mais recentes.</p>}</section>;
}
