import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstShiftsPage } from "@/db/repositories/sst-pages/administration";
import { SstForm } from "../SstForm";
import { saveSstPlannedShift } from "./actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function SstShiftsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const { employees, total, page, shifts } = await readSstShiftsPage(database, units.map(item => item.id), unit, params.page);
  const href = (value: number) => `/sst/jornadas?${new URLSearchParams({ page: String(value), budgetUnitId: unit?.id || "" })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Jornada planejada — integração RH</h1><p>Registre turnos reais previstos, separando intervalos de descanso. São usados no denominador do absenteísmo; não substituem as batidas de ponto nem lançam desconto em folha.</p><form className="flex gap-2"><select required name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Selecione a UG</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rounded border p-2">Carregar</button></form>{unit && <SstForm action={saveSstPlannedShift} label="Registrar turno"><input type="hidden" name="budgetUnitId" value={unit.id}/><label>Servidor<select required name="employeeId" className="block rounded border p-2"><option value="">Selecione</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Início<input required type="datetime-local" name="startsAt" className="block rounded border p-2"/></label><label>Término<input required type="datetime-local" name="endsAt" className="block rounded border p-2"/></label><p>Inclusão exige permissão de cadastro no módulo RH.</p></SstForm>}<section className="space-y-2 rounded border p-4">{shifts.map((shift) => <p key={shift.id}>{shift.employee.name} · {shift.startsAt.toLocaleString("pt-BR")} — {shift.endsAt.toLocaleString("pt-BR")}</p>)}<ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/></section></div>;
}
