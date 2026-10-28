import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getAuthorizedHistoricalExposure } from "@/lib/sst/functional-service";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { FunctionalSourceForm } from "../../rh/portal-funcional/ManagementForms";
export const dynamic = "force-dynamic";
export default async function PppTechnicalSourcePage({ searchParams }: { searchParams: Promise<{ employeeId?: string; budgetUnitId?: string; from?: string; until?: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports"), params = await searchParams;
  const units = await listSstUnits(sstDatabase(context), context);
  const today = new Date().toISOString().slice(0, 10), from = params.from || `${today.slice(0, 4)}-01-01`, until = params.until || today;
  let example: unknown = { employeeId: params.employeeId || "", budgetUnitId: params.budgetUnitId || "", from, until, proofVersionId: "", nit: "", cnae: "", establishmentAddress: "", occupations: [], groups: [] };
  if (params.employeeId && units.some(unit => unit.id === params.budgetUnitId)) {
    const begin = new Date(`${from}T03:00:00Z`), end = new Date(new Date(`${until}T03:00:00Z`).getTime() + 86400000);
    const source = await getAuthorizedHistoricalExposure(context, params.employeeId, params.budgetUnitId!, begin, end);
    example = { ...(example as object), occupations: source.periods.map(period => ({ functionalPeriodId: period.id, cbo: "", activities: "" })), groups: source.exposure.filter(exposure => exposure.kind === "LTCAT").filter((exposure, index, rows) => rows.findIndex(row => row.programGroupId === exposure.programGroupId) === index).map(exposure => ({ programGroupId: exposure.programGroupId, programVersion: exposure.version, risks: Array.isArray(exposure.risks) ? exposure.risks.map((risk, sourceRiskIndex) => ({ sourceRiskIndex, type: "", code: "", agent: (risk as { description?: string }).description || "", intensity: "", unit: "", technique: "", epcEffective: false, epiEffective: false, ca: [], legalReference: "" })) : [] })) };
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Fonte técnica do PPP" description="Vincule as medições, CBO e atividades à história RH/LTCAT e a um documento técnico assinado. O Portal libera o PPP somente após assinatura GED da emissão." /><form className="grid gap-2 rounded border bg-white p-3 text-xs sm:grid-cols-2"><label className="flex flex-col gap-1">UG<select name="budgetUnitId" defaultValue={params.budgetUnitId} required className="h-9 rounded border px-2">{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="flex flex-col gap-1">Identificador do servidor na história RH<input name="employeeId" required defaultValue={params.employeeId} className="h-9 rounded border px-2" /></label><input name="from" aria-label="Início" type="date" required defaultValue={from} className="h-9 rounded border px-2" /><input name="until" aria-label="Fim" type="date" required defaultValue={until} className="h-9 rounded border px-2" /><button className="rounded border px-3 py-2 sm:col-span-2">Carregar períodos e riscos de origem</button></form><FunctionalSourceForm key={JSON.stringify(params)} command="PPP_TECNICO" title="Reconhecer dados técnicos completos — versão documental assinada obrigatória" example={example} /></div>;
}
