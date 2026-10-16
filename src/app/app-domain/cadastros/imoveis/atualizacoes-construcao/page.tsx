import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import ApplyPropertyUpdateButton from "../../../obras/construcao-civil/vistorias/ApplyPropertyUpdateButton";
import { ConstructionLifecycleFilters, ConstructionLifecyclePagination } from "@/components/construction/ConstructionLifecycleListControls";
import { listConstructionPropertyUpdates, type LifecycleListQuery } from "@/lib/obras/construction-lifecycle-list";

export default async function ConstructionCadastralUpdatesPage({ searchParams }: { searchParams: Promise<LifecycleListQuery> }) {
  const query = await searchParams;
  const context = await getTenantContextForModule("CADASTROS");
  const access = await resolveConstructionAccess(context);
  const { updates, processes, total, page } = await listConstructionPropertyUpdates(context.prisma, access, query);
  return <main className="space-y-5 p-6"><Link href="/cadastros/imoveis" className="underline">Cadastro imobiliário</Link><h1 className="text-2xl font-bold">Atualizações vinculadas à Construção Civil</h1><p>Receba o processo cadastral em Protocolos antes de aplicar a proposta.</p>
    <ConstructionLifecycleFilters query={query} pageKey="page" filters={[{ key: "q", label: "Buscar protocolo / conclusão" }, { key: "status", label: "Situação", options: [{ value: "PENDING", label: "Pendente" }, { value: "APPLIED", label: "Aplicada" }] }]} />
    {!updates.length && <p>Nenhuma atualização encontrada no setor.</p>}{updates.map((update) => <article key={update.id} className="space-y-3 rounded border p-4"><h2 className="font-semibold">{update.completion.number} · {update.completion.kind} · {update.status}</h2><Link href={`/protocolos/processos/${update.processId}`} className="underline">{processes.find((process) => process.id === update.processId)?.protocolNumber}</Link><details><summary>Proposta e histórico antes/depois</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({ proposed: update.proposedSnapshot, before: update.beforeSnapshot, after: update.afterSnapshot }, null, 2)}</pre></details>{update.status === "PENDING" && <ApplyPropertyUpdateButton updateId={update.id} />}</article>)}
    <ConstructionLifecyclePagination query={query} pageKey="page" page={page} total={total} label="atualizações" />
  </main>;
}
