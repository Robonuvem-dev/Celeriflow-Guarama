import Link from "next/link";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canPerformModuleOperation, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readMunicipalCosts } from "@/lib/financeiro/cost-overview";

export async function MunicipalCostIndicators({ context, start, end, yearId }: { context: AppContext; start: Date; end: Date; yearId?: string }) {
  if (!canViewModule(context.user, "FINANCEIRO") || !canPerformModuleOperation(context.user, "FINANCEIRO", "issueReports")) return <section className="rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p className="text-sm">A leitura exige autorização de relatórios do Financeiro e escopo de UG.</p></section>;
  const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  try {
  const years = await context.prisma.financialYear.findMany({ where: { governmentEntityId: { not: null }, ...(actor.allowedBudgetUnitIds ? { governmentEntity: { planningUnits: { some: { budgetUnitId: { in: actor.allowedBudgetUnitIds } } } } } : {}) }, include: { governmentEntity: { select: { name: true } } }, orderBy: [{ year: "desc" }, { id: "asc" }] });
  const selected = years.find(year => year.id === yearId) ?? years.find(year => year.year === end.getUTCFullYear()) ?? years[0];
  if (!selected) return <section className="rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p className="text-sm">Sem exercício com entidade conciliada no escopo autorizado.</p></section>;
  const data = await readMunicipalCosts(context.prisma, actor, selected.id, { expenseFrom: start, expenseUntil: end, appropriationFrom: start, appropriationUntil: end });
  const detail = `/financeiro/custos?${new URLSearchParams({ yearId: selected.id, expenseFrom: start.toISOString().slice(0, 10), expenseUntil: end.toISOString().slice(0, 10), appropriationFrom: start.toISOString().slice(0, 10), appropriationUntil: end.toISOString().slice(0, 10) })}`;
  function chart(title: string, rows: Array<{ id: string; label: string; value: string }>) {
    const max = Math.max(1, ...rows.map(row => Math.abs(Number(row.value))));
    return <article className="rounded border p-3"><h3 className="font-medium">{title}</h3>{rows.map(row => <div key={row.id} className="mt-2 text-xs"><p>{row.label} · {row.value} BRL</p><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.abs(Number(row.value)) / max * 100}%` }} /></div></div>)}{!rows.length && <p className="mt-2 text-sm">Sem apropriações no período.</p>}</article>;
  }
  return <section className="space-y-3 rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos — {selected.governmentEntity?.name} / {selected.year}</h2><form method="get" className="flex flex-wrap gap-2"><input type="hidden" name="start" value={start.toISOString().slice(0, 10)} /><input type="hidden" name="end" value={end.toISOString().slice(0, 10)} /><select aria-label="Entidade e exercício dos custos" name="costYearId" defaultValue={selected.id} className="rounded border p-2 text-sm">{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} / {year.year}</option>)}</select><button className="rounded border p-2 text-sm">Selecionar</button><Link href={detail} className="rounded border p-2 text-sm underline">Detalhar no Financeiro</Link></form><p className="text-xs">Mesmo ledger e filtros do Financeiro. Despesa e apropriação usam o período selecionado; saldo pendente é a posição atual das origens nesse recorte. Gastos de Frotas não são somados novamente a este total.</p><table className="w-full text-sm"><thead><tr><th className="text-left">Tipo</th><th>Apropriado no período BRL</th><th>Pendente atual BRL</th></tr></thead><tbody>{data.byType.map(row => <tr key={row.type}><td>{row.type}</td><td className="text-center">{row.allocated}</td><td className="text-center">{row.pending}</td></tr>)}</tbody></table><div className="grid gap-3 lg:grid-cols-2">{chart("Apropriações por objeto", data.byObject)}{chart("Apropriações por item", data.byItem)}</div></section>;
  } catch (error) {
    console.error("Falha ao carregar indicadores de custos municipais", error);
    return <section className="rounded border border-amber-200 bg-amber-50 p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p role="alert" className="text-sm">Não foi possível carregar os custos municipais. Atualize a página para tentar novamente.</p></section>;
  }
}
