import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import ApplyPropertyUpdateButton from "./ApplyPropertyUpdateButton";
import { ConstructionLifecycleFilters, ConstructionLifecyclePagination } from "@/components/construction/ConstructionLifecycleListControls";
import { lifecycleFilter, lifecyclePage, lifecycleSearch, listConstructionPropertyUpdates, type LifecycleListQuery } from "@/lib/obras/construction-lifecycle-list";

export default async function ConstructionInspectionsPage({ searchParams }: { searchParams: Promise<LifecycleListQuery> }) {
  const query = await searchParams;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const search = lifecycleSearch(query.inspectionQ);
  const status = lifecycleFilter(query.inspectionStatus, ["REQUESTED", "APPROVED", "FAILED"]);
  const where = { case: constructionCaseWhere(access), status, ...(search ? { OR: [{ requestNotes: { contains: search, mode: "insensitive" as const } }, { case: { process: { protocolNumber: { contains: search, mode: "insensitive" as const } } } }] } : {}) };
  const [inspectionTotal, cadastral] = await Promise.all([
    context.prisma.constructionInspection.count({ where }),
    listConstructionPropertyUpdates(context.prisma, access, query, { page: "updatePage", search: "updateQ", status: "updateStatus" }),
  ]);
  const inspectionPage = lifecyclePage(query.inspectionPage, inspectionTotal);
  const inspections = await context.prisma.constructionInspection.findMany({ where, include: { case: { select: { id: true, process: { select: { protocolNumber: true } } } } }, orderBy: [{ requestedAt: "desc" }, { id: "asc" }], skip: (inspectionPage - 1) * 20, take: 20 });
  return <main className="space-y-6 p-6"><Link className="underline" href="/obras/construcao-civil">Construção Civil</Link><h1 className="text-2xl font-bold">Vistorias e atualizações imobiliárias</h1>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Vistorias do setor</h2>
      <ConstructionLifecycleFilters query={query} pageKey="inspectionPage" filters={[{ key: "inspectionQ", label: "Buscar protocolo / observações" }, { key: "inspectionStatus", label: "Situação", options: [{ value: "REQUESTED", label: "Pendente" }, { value: "APPROVED", label: "Aprovada" }, { value: "FAILED", label: "Reprovada" }] }]} />
      {!inspections.length && <p>Nenhuma vistoria encontrada.</p>}{inspections.map((inspection) => <article className="rounded border p-4" key={inspection.id}><Link className="underline" href={`/obras/construcao-civil/${inspection.case.id}/ciclo`}>{inspection.case.process.protocolNumber}</Link><p>{inspection.status} · Pedido {inspection.requestedAt.toISOString().slice(0, 10)} · Agendamento {inspection.scheduledAt?.toISOString().slice(0, 10) || "Não agendado"}</p><p>{inspection.requestNotes}</p></article>)}
      <ConstructionLifecyclePagination query={query} pageKey="inspectionPage" page={inspectionPage} total={inspectionTotal} label="vistorias" />
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Processos cadastrais do setor</h2>
      <ConstructionLifecycleFilters query={query} pageKey="updatePage" filters={[{ key: "updateQ", label: "Buscar protocolo / conclusão" }, { key: "updateStatus", label: "Situação", options: [{ value: "PENDING", label: "Pendente" }, { value: "APPLIED", label: "Aplicada" }] }]} />
      {!cadastral.updates.length && <p>Nenhuma atualização encontrada.</p>}{cadastral.updates.map((update) => <article className="space-y-2 rounded border p-4" key={update.id}><h3>{update.completion.number} · {update.status}</h3><Link className="underline" href={`/protocolos/processos/${update.processId}`}>{cadastral.processes.find((process) => process.id === update.processId)?.protocolNumber}</Link><details><summary>Proposta e histórico cadastral</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({ proposed: update.proposedSnapshot, before: update.beforeSnapshot, after: update.afterSnapshot }, null, 2)}</pre></details>{update.status === "PENDING" && <ApplyPropertyUpdateButton updateId={update.id} />}</article>)}
      <ConstructionLifecyclePagination query={query} pageKey="updatePage" page={cadastral.page} total={cadastral.total} label="atualizações" />
    </section></main>;
}
