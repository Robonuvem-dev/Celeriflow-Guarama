import Link from "next/link";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { annualComparisonFilters, readAnnualTaxComparison } from "@/lib/tributacao/annual-comparison";
import PrintMovements from "../movimentacoes-contabeis/PrintMovements";

export const dynamic = "force-dynamic";

export default async function AnnualComparisonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const params = await searchParams;
  const units = await prisma.planningEntityUnit.findMany({ where: allowedBudgetUnitIds ? { budgetUnitId: { in: allowedBudgetUnitIds } } : {}, include: { governmentEntity: true, budgetUnit: true } });
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const raw = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = annualComparisonFilters.safeParse({ firstYear: new Date().getFullYear() - 1, secondYear: new Date().getFullYear(), governmentEntityId: entities[0]?.[0], ...raw });
  if (!parsed.success) return <p className="p-4">{parsed.error.issues[0]?.message ?? "Selecione um ente autorizado."}</p>;
  let report: Awaited<ReturnType<typeof readAnnualTaxComparison>>;
  try { report = await readAnnualTaxComparison(prisma, { allowedBudgetUnitIds }, parsed.data); } catch (error) { return <p className="p-4">{error instanceof Error ? error.message : "Não foi possível consultar."}</p>; }
  const taxes = await prisma.tax.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const field = "block w-full rounded border p-1.5 text-xs";
  const query = new URLSearchParams(Object.entries(parsed.data).map(([key, value]) => [key, String(value)]));
  return <div className="h-full space-y-3 overflow-auto p-4"><h1 className="text-lg font-bold">Comparativo anual — IPTU, ISS e demais receitas tributárias</h1>
    <form className="grid gap-2 rounded border bg-white p-3 sm:grid-cols-4 print:hidden">
      <label className="text-xs">Ente<select name="governmentEntityId" defaultValue={report.filters.governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs">UG<select name="budgetUnitId" defaultValue={report.filters.budgetUnitId ?? ""} className={field}><option value="">Todas as UGs autorizadas do ente</option>{units.map(unit => <option key={unit.budgetUnitId} value={unit.budgetUnitId}>{unit.governmentEntity.name} · {unit.budgetUnit.code} · {unit.budgetUnit.name}</option>)}</select></label>
      <label className="text-xs">Tributo<select name="taxId" defaultValue={report.filters.taxId ?? ""} className={field}><option value="">Todos</option>{taxes.map(tax => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></label>
      <label className="text-xs">Comparar<select name="metric" defaultValue={report.filters.metric} className={field}><option value="NET">Tributo líquido atual</option><option value="VENAL">Valor venal anual do imóvel</option></select></label>
      <label className="text-xs">Primeiro exercício<input name="firstYear" type="number" defaultValue={report.filters.firstYear} className={field} /></label><label className="text-xs">Segundo exercício<input name="secondYear" type="number" defaultValue={report.filters.secondYear} className={field} /></label>
      <label className="text-xs">Contribuinte / inscrição<input name="query" defaultValue={report.filters.query} className={field} /></label>
      <label className="text-xs">Variação<select name="direction" defaultValue={report.filters.direction} className={field}><option value="ALL">Todas</option><option value="INCREASE">A maior</option><option value="DECREASE">A menor</option></select></label>
      <label className="text-xs">Diferença mínima (R$)<input name="minimumDifference" type="number" min="0" step="0.01" defaultValue={report.filters.minimumDifference} className={field} /></label><label className="text-xs">Variação mínima (%)<input name="minimumPercentage" type="number" min="0" step="0.000001" defaultValue={report.filters.minimumPercentage} className={field}/></label>
      <button className="rounded bg-emerald-700 p-2 text-xs text-white">Consultar</button>
    </form>
    <p className="text-xs">Posição operacional atual dos lançamentos e avaliações de cada exercício, com arrecadação confirmada e estornos considerados. Créditos compensados reduzem o saldo, sem serem apresentados como pagamento. Guias canceladas não integram a contagem ativa. Registros sem origem municipal ou valores Decimal conciliados não são presumidos. O resumo apresenta valores documentados; sua integralidade depende de não haver pendências.</p>
    <div className="flex gap-3 print:hidden"><PrintMovements /><Link className="text-xs text-emerald-700 underline" href={`/tributacao/comparativo-anual/exportar?${query}`}>Exportar CSV</Link></div>
    <table className="w-full text-left text-xs"><thead><tr><th>Resumo</th><th>{report.filters.firstYear}</th><th>{report.filters.secondYear}</th></tr></thead><tbody>{([["launched", "Valor lançado"], ["net", "Valor líquido atual"], ["discount", "Descontos"], ["paid", "Pagamentos confirmados"], ["outstanding", "Saldo em aberto"], ["assessments", "Lançamentos"], ["guides", "Guias ativas"], ["pendingDecimal", "Lançamentos com Decimal pendente"]] as const).map(([key, label]) => <tr key={key} className="border-t"><td className="py-1">{label}</td><td>{report.first[key]}</td><td>{report.second[key]}</td></tr>)}</tbody></table>
    <table className="w-full text-left text-xs"><thead><tr><th>Tributo / contribuinte</th><th>Inscrição</th><th>{report.filters.metric === "VENAL" ? "Venal" : "Líquido"} {report.filters.firstYear}</th><th>{report.filters.metric === "VENAL" ? "Venal" : "Líquido"} {report.filters.secondYear}</th><th>Diferença (R$)</th><th>Variação (%)</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.key} className="border-t"><td className="py-2">{row.tax} · {row.taxpayer}</td><td>{row.registration}</td><td>{row.comparedFirst ?? "Pendente"}</td><td>{row.comparedSecond ?? "Pendente"}</td><td>{row.change?.difference ?? "Não avaliada"}</td><td>{row.change?.percentage ?? "Não calculável"}</td></tr>)}</tbody></table>
  </div>;
}
