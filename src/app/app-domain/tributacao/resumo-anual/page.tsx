import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readAnnualTaxSummary } from "@/lib/tributacao/annual-tax-summary";
import AnnualSummaryClient from "./AnnualSummaryClient";
import BenefitClassificationClient from "./BenefitClassificationClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const dynamic = "force-dynamic";
export default async function AnnualTaxSummaryPage({ searchParams }: { searchParams: Promise<{ unit?: string; year?: string; tax?: string; kind?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const params = await searchParams; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, taxes] = await Promise.all([prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }), prisma.tax.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const selected = units.find(row => row.budgetUnitId === params.unit); let result: Awaited<ReturnType<typeof readAnnualTaxSummary>> | null = null; let error = "";
  if (selected) { try { result = await readAnnualTaxSummary(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: allowed }, { governmentEntityId: selected.governmentEntityId, budgetUnitId: selected.budgetUnitId, year: Number(params.year ?? new Date().getUTCFullYear()), taxId: params.tax || null, kind: params.kind === "ECONOMIC" ? "ECONOMIC" : params.kind === "ALL" ? "ALL" : "PROPERTY" }); } catch (failure) { error = failure instanceof Error ? failure.message : "Não foi possível consultar o resumo."; } }
  const rules = await prisma.taxBenefitRule.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  const classifications = await prisma.taxRegistryEntry.findMany({ where: { entityType: "TAX_BENEFIT_RULE", category: "BENEFIT_REPORT_CLASSIFICATION" }, orderBy: { version: "desc" } });
  const visibleRules = rules.filter(row => !allowed || allowed.includes(String(taxScopeSnapshot(row.eligibility).budgetUnitId))).map(row => { const current = classifications.find(entry => entry.entityId === row.id); return { id: row.id, label: `${row.code} · ${row.name} · ${row.legalReference}`, version: current?.version ?? 0, classification: String(taxScopeSnapshot(current?.data).classification ?? "OTHER") }; });
  return <div className="h-full space-y-4 overflow-auto p-4">
    <h1 className="text-lg font-bold">Resumo anual dos tributos</h1>
    <form className="grid gap-3 rounded border bg-white p-3 text-xs print:hidden sm:grid-cols-5">
      <label>Ente / UG<select name="unit" required defaultValue={selected?.budgetUnitId ?? ""} className="mt-1 w-full rounded border p-2"><option value="">Selecione</option>{units.map(row => <option key={row.budgetUnitId} value={row.budgetUnitId}>{row.governmentEntity.name} · {row.budgetUnit.code}</option>)}</select></label>
      <label>Exercício<input name="year" type="number" min="1900" max="2200" defaultValue={params.year ?? new Date().getUTCFullYear()} required className="mt-1 w-full rounded border p-2"/></label>
      <label>Cadastro<select name="kind" defaultValue={params.kind ?? "PROPERTY"} className="mt-1 w-full rounded border p-2"><option value="PROPERTY">Imobiliário / IPTU</option><option value="ECONOMIC">Econômico / ISS</option><option value="ALL">Todos</option></select></label>
      <label>Tributo<select name="tax" defaultValue={params.tax ?? ""} className="mt-1 w-full rounded border p-2"><option value="">Todos do cadastro</option>{taxes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <button className="rounded border p-2">Gerar resumo</button>
    </form>
    {error && <p role="alert" className="rounded border bg-amber-50 p-3 text-sm">{error}</p>}
    {result && <AnnualSummaryClient summary={result}/>}
    <BenefitClassificationClient rules={visibleRules}/>
  </div>;
}
