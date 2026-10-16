import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { portalPppReport } from "@/lib/sst/closure-service";
import { PppView } from "@/app/app-domain/sst/consolidado/ReportView";
type Search = { budgetUnitId?: string; from?: string; until?: string; page?: string };
export default async function PortalSstReports({ searchParams }: { searchParams: Promise<Search> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Vincule seu acesso ao cadastro funcional para consultar seu histórico SST.</p>;
  const { context, employee } = access;
  const params = await searchParams;
  const units = await context.prisma.$queryRaw<{ id: string; name: string }[]>`SELECT DISTINCT u.id,u.name FROM "HrEmployeeFunctionalPeriod" p JOIN "BudgetUnit" u ON u.id=p."budgetUnitId" JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId" WHERE p."employeeId"=${employee.id} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) ORDER BY u.name,u.id`;
  let report: Awaited<ReturnType<typeof portalPppReport>> | null = null;
  let failed = false;
  const baseHref = `/portal-servidor/sst/relatorios?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", from: params.from || "", until: params.until || "" })}`;
  if (params.budgetUnitId && params.from && params.until) {
    try {
      report = await portalPppReport(context, { budgetUnitId: params.budgetUnitId, from: params.from, until: params.until }, Number(params.page));
    } catch { failed = true; }
  }
  const output = failed ? <p role="alert">Não há histórico próprio verificado para esta UG/período, ou as datas são inválidas.</p> : report ? <PppView report={report} baseHref={baseHref}/> : null;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Meu histórico SST / PPP</h1><p>{employee.name} · matrícula {employee.registration || "Não informada"}</p><p>Dados do seu vínculo autenticado. O relatório indica períodos ausentes e riscos desconhecidos.</p>{!units.length && <p role="status">Histórico funcional canônico ainda não registrado/verificado. A lotação atual não será usada para reconstruir o passado.</p>}<form className="grid gap-3 rounded border p-3 sm:grid-cols-3"><label>UG do seu histórico<select required name="budgetUnitId" defaultValue={params.budgetUnitId} className="block w-full rounded border p-2">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Início<input required type="date" name="from" defaultValue={params.from} className="block w-full rounded border p-2"/></label><label>Fim exclusivo<input required type="date" name="until" defaultValue={params.until} className="block w-full rounded border p-2"/></label><button className="w-fit rounded border p-2">Consultar meu relatório</button></form>{output}</div>;
}
