import Link from "next/link";
import { HardHat } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { loadPageCaseList } from "@/db/repositories/works-pages/cases";

export default async function ConstructionCasesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const category = params.category === "BUILDING" || params.category === "SUBDIVISION" ? params.category : "";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const { total, page, cases } = await loadPageCaseList(context.database ?? db, access, { category, q, page: params.page });
  const href = (target: number) => `?${new URLSearchParams({ q, category, page: String(target) })}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Construção Civil — Solicitações" icon={<HardHat className="size-4" />} action={<Link href="/obras/construcao-civil/novo" className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Nova solicitação interna</Link>} />
    <div className="flex flex-wrap gap-3 text-xs"><Link href="/obras/construcao-civil/configuracoes" className="text-blue-700 underline">Configurações urbanísticas</Link><Link href="/obras/construcao-civil/taxas" className="text-blue-700 underline">Taxas, guias e débitos</Link>{access.administrator && <Link href="/obras/construcao-civil/equipe" className="text-blue-700 underline">Equipe e papéis</Link>}</div>
    <section className="rounded-lg border"><form className="flex flex-wrap gap-2 border-b p-2"><input name="q" defaultValue={q} aria-label="Buscar protocolo ou requerente" type="search" className="h-8 min-w-0 flex-1 rounded border bg-transparent px-2 text-sm" placeholder="Buscar protocolo ou requerente..." /><select name="category" defaultValue={category} aria-label="Categoria" className="h-8 rounded border bg-transparent px-2 text-xs"><option value="">Todas as categorias</option><option value="BUILDING">Obra</option><option value="SUBDIVISION">Parcelamento do solo</option></select><button className="rounded bg-blue-600 px-3 text-xs text-white">Filtrar</button></form>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">Protocolo / requerente</th><th className="hidden p-2 sm:table-cell">Setor</th><th className="w-24 p-2">Categoria</th><th className="hidden w-24 p-2 md:table-cell">Área (m²)</th><th className="w-28 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id} className="h-9 border-t"><td className="truncate p-2" title={`${item.process.protocolNumber} — ${item.process.person?.fullName || item.process.company?.corporateName || ""}`}><span className="font-medium">{item.process.protocolNumber}</span><p className="truncate text-[10px] text-slate-500">{item.process.person?.fullName || item.process.company?.corporateName}</p></td><td className="hidden truncate p-2 sm:table-cell">{item.process.currentDepartment?.name || "—"}</td><td className="p-2 text-[10px]">{item.category === "BUILDING" ? "Obra" : "Parcelamento"}<br />{item.locationType === "URBAN" ? "Urbana" : "Rural"}{item.regularization ? " • Regularização" : ""}</td><td className="hidden truncate p-2 md:table-cell" title={item.totalArea.toString()}>{item.totalArea.toString()}</td><td className="p-2 text-[10px]">{item.process.status}</td><td className="p-2 text-right"><Link className="text-blue-700 underline" href={`/obras/construcao-civil/${item.id}`}>Detalhes</Link></td></tr>)}</tbody></table>
      {!cases.length && <p className="p-6 text-center text-xs text-slate-500">Nenhuma solicitação disponível no seu setor. Confirme seu vínculo urbanístico vigente.</p>}<div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="solicitações" /></div>
    </section>
  </PageFrame>;
}
