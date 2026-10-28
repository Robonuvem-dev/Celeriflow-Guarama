import { canViewModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readMunicipalCosts } from "@/lib/financeiro/cost-overview";
import { CostsClient } from "./CostsClient";
import { costReportQuery, municipalCostFilters } from "@/lib/financeiro/cost-query";
import { readPayrollCostOptions } from "@/lib/financeiro/cost-payroll-options";
import { PayrollCostRulesClient } from "./PayrollCostRulesClient";
import { readStockCostOptions } from "@/lib/financeiro/cost-stock-options";
import { StockCostRulesClient } from "./StockCostRulesClient";
import { db, databaseConnection } from "@/db/client";
import { listFinancialEntityYears } from "@/db/repositories/finance/report-scopes";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { listCostOptionAppropriations, listCostOptionLoas } from "@/db/repositories/finance/cost-options";

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const actor = { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds };
  const years = await listFinancialEntityYears(executor, actor.allowedBudgetUnitIds);
  const query = await searchParams;
  const yearId = typeof query.yearId === "string" ? query.yearId : undefined;
  const selected = yearId
    ? years.find(year => year.id === yearId)
    : years.find(year => year.year === new Date().getUTCFullYear() && year.status === "Aberto")
      ?? years.find(year => year.status === "Aberto") ?? years[0];
  if (yearId && !selected) return <p className="p-5">Exercício de Custos indisponível no acesso autorizado.</p>;
  if (!selected) return <p className="p-5">Nenhum exercício com entidade conciliada disponível para Custos.</p>;
  const filters = costReportQuery.safeParse({ ...query, yearId: selected.id });
  if (!filters.success) return <p className="p-5">{filters.error.issues[0]?.message ?? "Filtros inválidos."}</p>;
  const payrollAuthorized = canViewModule(user, "RH") && (await findModuleActivation(executor, "RH"))?.ativo;
  const payrollOptions = payrollAuthorized ? await readPayrollCostOptions(databaseConnection, actor, selected.id) : null;
  const stockAuthorized = canViewModule(user, "PATRIMONIO") && (await findModuleActivation(executor, "PATRIMONIO"))?.ativo;
  const stockOptions = stockAuthorized ? await readStockCostOptions(databaseConnection, actor, selected.id) : null;
  const [overview, instruments, appropriations] = await Promise.all([
    readMunicipalCosts(databaseConnection, actor, selected.id, municipalCostFilters(filters.data)),
    listCostOptionLoas(executor, selected.governmentEntityId!, selected.year),
    listCostOptionAppropriations(executor, selected.id, actor.allowedBudgetUnitIds),
  ]);
  return <>
    <CostsClient data={JSON.parse(JSON.stringify(overview))} years={years.map(year => ({ id: year.id, name: `${year.governmentEntity?.name} — ${year.year}` }))} instruments={instruments} appropriations={appropriations} />
    {payrollOptions && <PayrollCostRulesClient yearId={selected.id} year={selected.year} units={overview.units} objects={overview.objects} items={overview.items} options={payrollOptions} />}
    {stockOptions && <StockCostRulesClient yearId={selected.id} year={selected.year} units={overview.units} objects={overview.objects} items={overview.items} options={stockOptions} />}
    <section className="space-y-3 p-5"><h2 className="font-semibold">Correções de origens de exercícios anteriores</h2>{overview.priorYearCorrections.map(correction => <article key={correction.id} className="rounded border p-3 text-sm"><p>{correction.kind} · {correction.date.slice(0, 10)} · {correction.amount} BRL · UG {correction.budgetUnitId}</p><p>Despesa original: {correction.expenseDate.slice(0, 10)} · origem {correction.originFinancialYearId} · reconhecimento {correction.recognitionFinancialYearId}</p><p>{correction.reason}</p>{correction.kind !== "SOURCE_REDUCTION" && <a className="underline" href={`/api/financeiro/custos?yearId=${encodeURIComponent(selected.id)}&movementId=${encodeURIComponent(correction.id)}&format=PDF`}>Baixar nota da correção</a>}</article>)}{!overview.priorYearCorrections.length && <p className="text-sm">Sem correções de origens anteriores no período selecionado.</p>}</section>
    <section className="space-y-3 p-5"><h2 className="font-semibold">Devoluções de consumo e teto líquido das origens</h2>{overview.sources.filter(source => source.reductions.length).map(source => <article key={source.id} className="rounded border p-3 text-sm"><p>{source.sourceType} · {source.sourceId} · original {source.amount} BRL · devolvido {source.reduced} BRL · líquido {source.netAmount} BRL · saldo a apropriar {source.pending} BRL</p>{source.reductions.map(reduction => <details key={reduction.id} className="mt-2"><summary>{reduction.date.slice(0, 10)} · devolução {reduction.amount} BRL · {reduction.reason}</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(reduction.snapshot, null, 2)}</pre></details>)}</article>)}{!overview.sources.some(source => source.reductions.length) && <p className="text-sm">Sem devoluções registradas no recorte de origens selecionado.</p>}</section>
  </>;
}
