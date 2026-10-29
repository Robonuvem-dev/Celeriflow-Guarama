import Link from "next/link";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canPerformModuleOperation, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readMunicipalCosts } from "@/lib/financeiro/cost-overview";
import { db, databaseConnection } from "@/db/client";
import { listFinancialEntityYears } from "@/db/repositories/finance/report-scopes";
import FinanceTablePanel from "../financeiro/FinanceTablePanel";
import { financeColumn } from "../financeiro/operational-columns";

type CostIndicatorView = {
  years: Awaited<ReturnType<typeof listFinancialEntityYears>>;
  selected: Awaited<ReturnType<typeof listFinancialEntityYears>>[number];
  data: Awaited<ReturnType<typeof readMunicipalCosts>>;
};

export async function MunicipalCostIndicators({ context, start, end, yearId }: { context: AppContext; start: Date; end: Date; yearId?: string }) {
  if (!canViewModule(context.user, "FINANCEIRO") || !canPerformModuleOperation(context.user, "FINANCEIRO", "issueReports")) return <section className="rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p className="text-sm">A leitura exige autorização de relatórios do Financeiro e escopo de UG.</p></section>;
  const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  let view: CostIndicatorView | null | undefined;
  try {
    const years = await listFinancialEntityYears(context.database ?? db, actor.allowedBudgetUnitIds);
    const selected = years.find(year => year.id === yearId) ?? years.find(year => year.year === end.getUTCFullYear()) ?? years[0];
    view = selected ? { years, selected, data: await readMunicipalCosts(databaseConnection, actor, selected.id, { expenseFrom: start, expenseUntil: end, appropriationFrom: start, appropriationUntil: end }) } : null;
  } catch (error) {
    console.error("Falha ao carregar indicadores de custos municipais", error);
  }
  if (view === undefined) return <section className="rounded border border-amber-200 bg-amber-50 p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p role="alert" className="text-sm">Não foi possível carregar os custos municipais. Atualize a página para tentar novamente.</p></section>;
  if (view === null) return <section className="rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos</h2><p className="text-sm">Sem exercício com entidade conciliada no escopo autorizado.</p></section>;
  const { years, selected, data } = view;
  const detail = `/financeiro/custos?${new URLSearchParams({ yearId: selected.id, expenseFrom: start.toISOString().slice(0, 10), expenseUntil: end.toISOString().slice(0, 10), appropriationFrom: start.toISOString().slice(0, 10), appropriationUntil: end.toISOString().slice(0, 10) })}`;
  function chart(title: string, rows: Array<{ id: string; label: string; value: string }>) {
    const max = Math.max(1, ...rows.map(row => Math.abs(Number(row.value))));
    return <article className="rounded border p-3"><h3 className="font-medium">{title}</h3>{rows.map(row => <div key={row.id} className="mt-2 text-xs"><p>{row.label} · {row.value} BRL</p><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.abs(Number(row.value)) / max * 100}%` }} /></div></div>)}{!rows.length && <p className="mt-2 text-sm">Sem apropriações no período.</p>}</article>;
  }
  return <section className="space-y-3 rounded border bg-white p-3"><h2 className="font-semibold">Indicadores de Custos — {selected.governmentEntity?.name} / {selected.year}</h2><form method="get" className="flex flex-wrap gap-2"><input type="hidden" name="start" value={start.toISOString().slice(0, 10)} /><input type="hidden" name="end" value={end.toISOString().slice(0, 10)} /><select aria-label="Entidade e exercício dos custos" name="costYearId" defaultValue={selected.id} className="rounded border p-2 text-sm">{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} / {year.year}</option>)}</select><button className="rounded border p-2 text-sm">Selecionar</button><Link href={detail} className="rounded border p-2 text-sm underline">Detalhar no Financeiro</Link></form><p className="text-xs">Mesmo ledger e filtros do Financeiro. Despesa e apropriação usam o período selecionado; saldo pendente é a posição atual das origens nesse recorte. Gastos de Frotas não são somados novamente a este total.</p>
    <FinanceTablePanel label="Indicadores de custos por tipo" description={`${selected.governmentEntity?.name} / ${selected.year}`} preferenceId="indicadores-custos" resetKey={`${selected.id}:${start.toISOString()}:${end.toISOString()}`}
      columns={[financeColumn("type", "Tipo", 100, 260), financeColumn("allocated", "Apropriado no período BRL", 100, 230, "text", "right"), financeColumn("pending", "Pendente atual BRL", 100, 230, "text", "right")]}
      rows={data.byType.map(row => ({ id: row.type, label: row.type, values: { type: row.type, allocated: row.allocated, pending: row.pending } }))} />
    <div className="grid gap-3 lg:grid-cols-2">{chart("Apropriações por objeto", data.byObject)}{chart("Apropriações por item", data.byItem)}</div></section>;
}
