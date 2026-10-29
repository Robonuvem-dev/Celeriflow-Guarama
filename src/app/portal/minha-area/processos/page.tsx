import Link from "next/link";
import { db } from "@/db/client";
import { and, count, ilike } from "drizzle-orm";
import { processes } from "@/db/schema/processes";
import { listCitizenProcesses } from "@/db/repositories/processes/citizen";
import { getCitizenAccount, getCitizenProcessWhere } from "@/lib/portal-cidadao/access";
import { PublicOperationalList } from "../../PublicOperationalList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export const dynamic = "force-dynamic";

export default async function CitizenProcessesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const account = await getCitizenAccount(`/portal/minha-area/processos?${new URLSearchParams({ q, page: typeof query.page === "string" ? query.page : "1" })}`);
  const scope = await getCitizenProcessWhere(account.id);
  const where = and(scope, q ? ilike(processes.protocolNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(processes).where(where);
  const page = Math.min(Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const items = await listCitizenProcesses(db, where, { limit: OPERATIONAL_PAGE_SIZE, offset: (page - 1) * OPERATIONAL_PAGE_SIZE });
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
    <Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800 hover:underline">← Minha área</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-950">Meus processos</h1><p className="mt-2 text-sm leading-6 text-slate-600">Acompanhe os processos vinculados e autorizados para sua conta.</p></div><Link href="/portal/minha-area/servicos" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Solicitar serviço</Link></div>
    <PublicOperationalList id="meus-processos" caption="Processos com acompanhamento autorizado" serverPagination={{ page, total, pathname: "/portal/minha-area/processos", values: { q } }}
      toolbar={<form className="flex w-full min-w-0 gap-2"><input aria-label="Número do protocolo" name="q" defaultValue={q} maxLength={100} placeholder="Ex.: PROC-2026-000001" className="h-7 min-w-0 flex-1 rounded border px-2 text-sm" /><button className="rounded bg-emerald-700 px-3 text-sm font-semibold text-white">Buscar</button>{q && <Link href="/portal/minha-area/processos" className="text-sm underline">Limpar</Link>}</form>}
      columns={[["protocol", "Protocolo", 180, 110, "identifier"], ["service", "Serviço", 200, 110], ["status", "Situação", 140, 90, "status"], ["department", "Setor atual", 180, 100], ["created", "Abertura", 110, 90], ["expected", "Prazo previsto", 130, 100], ["actions", "Acesso", 75, 75, "actions"]]}
      rows={items.map((item) => ({ id: item.id, label: item.protocolNumber, values: { protocol: item.protocolNumber, service: item.subject.name, status: item.status, department: item.currentDepartment?.name || "Não atribuído", created: item.createdAt.toLocaleDateString("pt-BR"), expected: item.expectedCompletionAt?.toLocaleDateString("pt-BR") || "Não definido" }, actions: <Link href={`/portal/minha-area/processos/${item.id}`} className="font-bold text-emerald-800 underline">Abrir</Link> }))} />
    {!items.length && <section className="rounded border bg-slate-50 p-3"><h2>{q ? "Nenhum processo encontrado" : "Nenhum processo disponível para acompanhamento"}</h2><p className="text-sm">{q ? "Confira o número informado. A pesquisa considera somente seus processos autorizados." : "O processo aparecerá aqui quando houver vínculo autorizado com sua conta. Para solicitar a vinculação de um protocolo existente, contate o atendimento municipal."}</p><Link href="/portal/contato" className="text-sm underline">Contatar atendimento</Link></section>}
  </main>;
}
