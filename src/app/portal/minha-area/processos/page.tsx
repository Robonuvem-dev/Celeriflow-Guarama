import Link from "next/link";
import { db } from "@/db/client";
import { and, count, ilike } from "drizzle-orm";
import { processes } from "@/db/schema/processes";
import { listCitizenProcesses } from "@/db/repositories/processes/citizen";
import { getCitizenAccount, getCitizenProcessWhere } from "@/lib/portal-cidadao/access";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";

export default async function CitizenProcessesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const account = await getCitizenAccount(`/portal/minha-area/processos?${new URLSearchParams({ q, page: typeof query.page === "string" ? query.page : "1" })}`);
  const scope = await getCitizenProcessWhere(account.id);
  const where = and(scope, q ? ilike(processes.protocolNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(processes).where(where);
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const items = await listCitizenProcesses(db, where, { limit: 20, offset: (page - 1) * 20 });
  const href = (target: number) => `?${new URLSearchParams({ q, page: String(target) })}`;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
    <Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800 hover:underline">← Minha área</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-950">Meus processos</h1><p className="mt-2 text-sm leading-6 text-slate-600">Acompanhe os processos vinculados e autorizados para sua conta.</p></div><Link href="/portal/minha-area/servicos" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Solicitar serviço</Link></div>
    <form className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><label htmlFor="protocol-search" className="mb-2 block text-sm font-semibold text-slate-700">Número do protocolo</label><input id="protocol-search" name="q" defaultValue={q} maxLength={100} placeholder="Ex.: PROC-2026-000001" className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" /></div><button className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Buscar</button>{q && <Link href="/portal/minha-area/processos" className="py-3 text-sm font-semibold text-slate-600 hover:underline">Limpar</Link>}</form>
    {items.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><caption className="sr-only">Processos com acompanhamento autorizado</caption><thead className="bg-slate-50 text-slate-700"><tr>{["Protocolo / serviço", "Situação", "Setor atual", "Abertura", "Prazo previsto"].map((label) => <th key={label} scope="col" className="p-4 font-semibold">{label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-4"><Link href={`/portal/minha-area/processos/${item.id}`} className="font-bold text-emerald-800 hover:underline">{item.protocolNumber}</Link><p className="mt-1 text-slate-600">{item.subject.name}</p></td><td className="p-4"><span className="inline-block rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">{item.status}</span></td><td className="p-4">{item.currentDepartment?.name || "Não atribuído"}</td><td className="whitespace-nowrap p-4">{item.createdAt.toLocaleDateString("pt-BR")}</td><td className="whitespace-nowrap p-4">{item.expectedCompletionAt?.toLocaleDateString("pt-BR") || "Não definido"}</td></tr>)}</tbody></table></div> : <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><h2 className="font-semibold text-slate-900">{q ? "Nenhum processo encontrado" : "Nenhum processo disponível para acompanhamento"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{q ? "Confira o número informado. A pesquisa considera somente seus processos autorizados." : "O processo aparecerá aqui quando houver vínculo autorizado com sua conta. Para solicitar a vinculação de um protocolo existente, contate o atendimento municipal."}</p><Link href="/portal/contato" className="mt-4 inline-block text-sm font-semibold text-emerald-800 hover:underline">Contatar atendimento</Link></section>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="processos" />
  </main>;
}
