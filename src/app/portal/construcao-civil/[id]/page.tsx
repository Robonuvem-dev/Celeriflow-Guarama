import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import ConstructionConversation from "@/components/construction/ConstructionConversation";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import ConstructionUpload from "@/components/construction/ConstructionUpload";
import ConstructionExternalRequests from "@/components/construction/ConstructionExternalRequests";
import ConstructionInspectionRequirements from "@/components/construction/ConstructionInspectionRequirements";
import { getConstructionInspectionCorrections } from "@/lib/obras/construction-lifecycle-deadlines";

export default async function ConstructionPortalDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const identity = await getConstructionPortalIdentity(); const { id } = await params;
  const item = await prisma.constructionCase.findFirst({ where: { AND: [{ id }, constructionPortalCaseWhere(identity.id)] }, select: { id: true, reviewStatus: true, revisionCount: true, correctionDeadline: true, process: { select: { protocolNumber: true, description: true } } } });
  if (!item) notFound();
  const [inspectionRequirements, inspectionTypes] = await Promise.all([
    getConstructionInspectionCorrections(prisma, id),
    prisma.constructionCatalogEntry.findMany({ where: { kind: "INSPECTION_TYPE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const query = await searchParams; const total = await prisma.constructionMessage.count({ where: { caseId: id } });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const [messages, term] = await Promise.all([prisma.constructionMessage.findMany({ where: { caseId: id }, select: { id: true, content: true, createdAt: true, identityId: true, documentId: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }), prisma.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true, version: true, text: true } })]);
  const accepted = term ? Boolean(await prisma.constructionTermAcceptance.findUnique({ where: { caseId_identityId_termId: { caseId: id, identityId: identity.id, termId: term.id } }, select: { id: true } })) : false;
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
    <Link href="/portal/construcao-civil" className="text-sm text-blue-700 underline">Voltar</Link><h1 className="text-xl font-semibold">{item.process.protocolNumber}</h1><p className="whitespace-pre-wrap text-sm">{item.process.description}</p><p className="text-sm">Análise: {item.reviewStatus} — Revisão {item.revisionCount}{item.correctionDeadline ? ` — Prazo de ajuste: ${item.correctionDeadline.toLocaleDateString("pt-BR")}` : ""}</p>
    <ConstructionExternalRequests caseId={id} termId={term?.id} accepted={accepted} />
    <Link href={`/portal/construcao-civil/${id}/viabilidade-automatica`} className="inline-block text-sm text-blue-700 underline">Avaliar viabilidade demonstrativa automaticamente</Link>
    <ConstructionInspectionRequirements requirements={inspectionRequirements} inspectionTypes={inspectionTypes} nowISO={new Date().toISOString()} />
    <section className="space-y-3 rounded border p-3"><h2 className="font-semibold">Comunicação com o setor responsável</h2><ConstructionConversation key={String(accepted) + term?.id} caseId={id} external term={term} accepted={accepted} />{accepted && <ConstructionUpload caseId={id} />}{messages.map((message) => <article key={message.id} className="rounded border p-3"><p className="text-xs text-slate-500">{message.identityId ? "Profissional" : "Setor municipal"} — {message.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>{message.documentId && <a className="text-xs text-blue-700 underline" href={`/api/construcao-civil/anexos?${new URLSearchParams({ caseId: id, documentId: message.documentId })}`}>Baixar documento complementar</a>}</article>)}<ErpPagination page={page} total={total} pageSize={20} previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} label="mensagens" /></section>
  </main>;
}
