import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { pppReport, functionalSstReport } from "@/lib/sst/closure-service";
import { PppView, FunctionalView } from "./ReportView";
type Search = { budgetUnitId?: string; employeeId?: string; from?: string; until?: string; kind?: string; page?: string };
export default async function ConsolidatedPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  const params = await searchParams;
  const units = await listSstUnits(sstDatabase(context), context);
  const input = { budgetUnitId: params.budgetUnitId || "", employeeId: params.employeeId || "", from: params.from || "", until: params.until || "" };
  const baseHref = `/sst/consolidado?${new URLSearchParams({ ...input, kind: params.kind || "PPP" })}`;
  let ppp: Awaited<ReturnType<typeof pppReport>> | null = null;
  let functional: Awaited<ReturnType<typeof functionalSstReport>> | null = null;
  let failure: string | null = null;
  if (params.employeeId) {
    try { if (params.kind === "FUNCTIONAL") functional = await functionalSstReport(context, input, Number(params.page)); else ppp = await pppReport(context, input, Number(params.page)); }
    catch (error) { failure = error instanceof AccessError ? error.message : "Confira o servidor, as datas e a disponibilidade das fontes ocupacionais/históricas."; }
  }
  const output = failure ? <p role="alert" className="rounded border p-3">{failure}</p> : functional ? <FunctionalView report={functional} baseHref={baseHref}/> : ppp ? <PppView report={ppp} baseHref={baseHref}/> : null;
  return <div className="space-y-4 p-4">
    <h1 className="text-xl font-semibold">Relatórios consolidados SST</h1>
    <p>Histórico RH canônico e fontes ocupacionais. Período final exclusivo. A base médica exige autorização de Medicina; prontuários das demais atuações são incluídos somente com autorização própria de leitura.</p>
    <form className="grid gap-3 rounded border p-3 sm:grid-cols-2">
      <label>UG<select required name="budgetUnitId" defaultValue={params.budgetUnitId} className="block w-full rounded border p-2">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label>ID do servidor canônico<input required name="employeeId" defaultValue={params.employeeId} className="block w-full rounded border p-2"/></label>
      <label>Início<input required type="date" name="from" defaultValue={params.from} className="block w-full rounded border p-2"/></label>
      <label>Fim exclusivo<input required type="date" name="until" defaultValue={params.until} className="block w-full rounded border p-2"/></label>
      <label>Relatório<select name="kind" defaultValue={params.kind || "PPP"} className="block w-full rounded border p-2"><option value="PPP">Histórico preparatório PPP</option><option value="FUNCTIONAL">Funcional clínico autorizado</option></select></label>
      <button className="w-fit rounded border px-4 py-2">Consultar relatório</button>
    </form>{output}
  </div>;
}
