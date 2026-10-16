import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import { constructionRequestKinds } from "@/lib/obras/construction-request-policy";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionServiceRequestForm from "./ConstructionServiceRequestForm";

export default async function ConstructionExternalRequests({ caseId, termId, accepted }: { caseId: string; termId: string | undefined; accepted: boolean }) {
  const identity = await getConstructionPortalIdentity();
  const record = await prisma.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionPortalCaseWhere(identity.id)] }, select: { processId: true, revisionCount: true, reviewStatus: true, additionalValues: true, formSnapshot: true } });
  if (!record) return null;
  const shared = await prisma.constructionMessage.findMany({ where: { caseId, documentId: { not: null } }, select: { documentId: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const [requests, documents, permits] = await Promise.all([
    prisma.constructionServiceRequest.findMany({ where: { caseId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50, select: { id: true, kind: true, status: true, notes: true, createdAt: true, resolution: true } }),
    prisma.document.findMany({ where: { id: { in: shared.flatMap((message) => message.documentId ? [message.documentId] : []) }, processDocuments: { some: { processId: record.processId } }, status: { in: ["Válido", "Assinado"] } }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 200 }),
    prisma.constructionIssuedDocument.findMany({ where: { caseId, kind: "PERMIT", status: "PUBLISHED" }, select: { id: true, number: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const snapshot = record.formSnapshot as { definition?: unknown };
  const fields = definitionSchema.parse(snapshot.definition || { fields: [], checks: [], documents: [] }).fields;
  return <section className="space-y-3"><h2 className="font-semibold">Pedidos e reenvios</h2>{accepted && termId ? <ConstructionServiceRequestForm key={`${record.revisionCount}:${termId}`} caseId={caseId} revision={record.revisionCount} reviewStatus={record.reviewStatus} termId={termId} documents={documents} permits={permits} fields={fields} values={record.additionalValues as Record<string, string>} /> : <p className="text-sm">Aceite o termo vigente para solicitar serviços.</p>}{requests.map((request) => <article key={request.id} className="rounded border p-3 text-sm"><p className="font-semibold">{constructionRequestKinds[request.kind as keyof typeof constructionRequestKinds]} — {request.status}</p><p className="text-xs">{request.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap">{request.notes}</p>{request.resolution && <p className="whitespace-pre-wrap">Resposta: {request.resolution}</p>}</article>)}{requests.length === 50 && <p className="text-xs">Exibindo os 50 pedidos mais recentes.</p>}</section>;
}
