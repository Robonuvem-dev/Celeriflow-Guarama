import Link from "next/link";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readResourceAvailability } from "@/lib/financeiro/resource-availability";
import { db, databaseConnection } from "@/db/client";
import { listFinancePageSources, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ financialYearId?: string; resourceSourceIds?: string | string[] }> }) {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
  const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
  const executor = context.database ?? db;
  const years = (await listFinancePageYears(executor, { allowedBudgetUnitIds })).filter(year => year.governmentEntity !== null);
  const year = years.find(year => year.id === params.financialYearId) ?? (!params.financialYearId ? years.find(year => year.status === "Aberto") ?? years[0] : undefined);
  const sources = await listFinancePageSources(executor);
  const selected = params.resourceSourceIds ? Array.isArray(params.resourceSourceIds) ? params.resourceSourceIds : [params.resourceSourceIds] : [];
  let result: Awaited<ReturnType<typeof readResourceAvailability>> | undefined;
  let error: string | undefined;
  if (year?.governmentEntityId) {
    try { result = await readResourceAvailability(databaseConnection, { allowedBudgetUnitIds }, { financialYearId: year.id, governmentEntityId: year.governmentEntityId, resourceSourceIds: selected }); }
    catch (failure) { error = failure instanceof Error ? failure.message : "Não foi possível gerar a disponibilidade."; }
  } else error = "Selecione um exercício de ente autorizado.";
  const csvParams = new URLSearchParams({ financialYearId: year?.id ?? "", governmentEntityId: year?.governmentEntityId ?? "" });
  for (const sourceId of selected) csvParams.append("resourceSourceIds", sourceId);
  return <div className="h-full overflow-auto space-y-3 p-3">
    <header><h1 className="text-lg font-bold">Disponibilidade de recursos por fonte</h1><p className="text-sm text-slate-600">Posição operacional atual: caixa, empenhos, restos e obrigações extraorçamentárias das UGs autorizadas.</p><Link className="text-sm text-emerald-800 underline" href="/financeiro/contabilidade">Contabilidade</Link></header>
    <form className="grid gap-3 rounded border bg-white p-3 sm:grid-cols-2" method="get"><label className="text-sm">Exercício e ente<select className="block w-full rounded border p-2" name="financialYearId" defaultValue={year?.id}>{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} · {year.year}</option>)}</select></label><label className="text-sm">Fontes (seleção múltipla)<select multiple name="resourceSourceIds" defaultValue={selected} className="block h-28 w-full rounded border p-2">{sources.map(source => <option key={source.id} value={source.id}>{source.code} · {source.name}</option>)}</select><span className="text-xs text-slate-500">Sem seleção: todas as fontes.</span></label><button className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm text-white">Emitir relatório</button></form>
    {error && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">{error}</p>}
    {result && <section className="space-y-3 rounded border bg-white p-3"><p className="text-sm">{year?.governmentEntity?.name} · exercício {year?.year} · posição {new Date(result.positionDate).toLocaleString("pt-BR")}{!result.fullEntity && " · recorte das UGs autorizadas"}</p><Link className="text-sm text-emerald-800 underline" href={`/api/financeiro/disponibilidade?${csvParams}`}>Baixar relatório CSV</Link><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Fonte", "Saldo disponível", "Empenhos a pagar", "RAP a pagar", "Extras a pagar", "Déficit/superávit"].map(label => <th key={label} className="border-b p-2">{label}</th>)}</tr></thead><tbody>{result.rows.map(row => <tr key={row.sourceId}><td className="p-2">{row.sourceCode} · {row.sourceName}</td>{[row.availableBalance, row.commitmentsPayable, row.carryForwardsPayable, row.extraPayables, row.deficitSurplus].map((value, index) => <td key={index} className="p-2 text-right font-mono">{value}</td>)}</tr>)}</tbody></table></div></section>}
  </div>;
}
