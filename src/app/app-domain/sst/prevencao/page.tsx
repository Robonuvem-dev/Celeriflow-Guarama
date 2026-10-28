import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listPrevention } from "@/lib/sst/prevention-service";
import { preventionKinds } from "@/lib/sst/prevention-policy";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
export const dynamic = "force-dynamic";
export default async function PreventionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("SST"), search = await searchParams;
  const val = (key: string) => typeof search[key] === "string" ? search[key] as string : "";
  const result = await listPrevention(context, { page: val("page") || 1, kind: val("kind"), q: val("q"), budgetUnitId: val("budgetUnitId") });
  const units = await listSstUnits(sstDatabase(context), context);
  const href = (page: number) => `/sst/prevencao?${new URLSearchParams({ ...result.filter, page: String(page) })}`;
  return <main className="space-y-5 p-4"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">CIPA e prevenção</h1><p className="text-sm">Mandatos, inspeções, programas e controle técnico por unidade gestora.</p></div><div className="flex gap-3"><Link className="rounded bg-teal-700 px-4 py-2 text-white" href="/sst/prevencao/novo">Novo registro</Link><Link className="rounded border px-3 py-2" href="/sst/prevencao/calendario">Calendário anual</Link></div></header>
    <form className="flex flex-wrap gap-3" method="get"><label>Busca<input className="ml-2 rounded border p-2" name="q" defaultValue={result.filter.q} /></label><label>Rotina<select name="kind" className="ml-2 rounded border p-2" defaultValue={result.filter.kind}><option value="">Todas</option>{Object.entries(preventionKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>UG<select name="budgetUnitId" className="ml-2 rounded border p-2" defaultValue={result.filter.budgetUnitId}><option value="">Todas autorizadas</option>{units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></label><button className="rounded border px-3">Filtrar</button></form>
    <table className="w-full table-fixed text-sm"><colgroup><col className="w-[44%]"/><col className="w-[26%]"/><col className="w-[18%]"/><col className="w-[12%]"/></colgroup><thead><tr className="border-b text-left"><th className="p-2">Identificação</th><th className="p-2">Rotina</th><th className="p-2">Cadastro</th><th className="p-2">Ficha</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id} className="border-b"><td className="break-words p-2">{row.title}</td><td className="break-words p-2">{preventionKinds[row.kind]}</td><td className="p-2">{row.createdAt.toLocaleDateString("pt-BR")}</td><td className="p-2"><Link className="text-teal-800 underline" href={`/sst/prevencao/${row.id}`}>Abrir</Link></td></tr>)}</tbody></table>
    {!result.total && <p role="status">Nenhum registro para os filtros selecionados.</p>}
    <ErpPagination page={result.page} total={result.total} pageSize={20} previousHref={href(result.page - 1)} nextHref={href(result.page + 1)} jumpTo={{ pathname: "/sst/prevencao", values: { q: result.filter.q, kind: result.filter.kind, budgetUnitId: result.filter.budgetUnitId } }} />
  </main>;
}
