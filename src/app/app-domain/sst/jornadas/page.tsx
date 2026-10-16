import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "@/lib/sst/access";
import { SstForm } from "../SstForm";
import { saveSstPlannedShift } from "./actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function SstShiftsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } });
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const employees = unit ? await context.prisma.employee.findMany({ where: { secretariatId: unit.secretariatId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const where = { budgetUnitId: { in: unit ? [unit.id] : units.map((item) => item.id) } };
  const total = await context.prisma.sstPlannedShift.count({ where });
  const page = Math.min(Math.max(1, Math.trunc(Number(params.page)) || 1), Math.max(1, Math.ceil(total / 20)));
  const shifts = await context.prisma.sstPlannedShift.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ startsAt: "desc" }, { id: "asc" }], include: { employee: { select: { name: true } } } });
  const href = (value: number) => `/sst/jornadas?${new URLSearchParams({ page: String(value), budgetUnitId: unit?.id || "" })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Jornada planejada — integração RH</h1><p>Registre turnos reais previstos, separando intervalos de descanso. São usados no denominador do absenteísmo; não substituem as batidas de ponto nem lançam desconto em folha.</p><form className="flex gap-2"><select required name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Selecione a UG</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rounded border p-2">Carregar</button></form>{unit && <SstForm action={saveSstPlannedShift} label="Registrar turno"><input type="hidden" name="budgetUnitId" value={unit.id}/><label>Servidor<select required name="employeeId" className="block rounded border p-2"><option value="">Selecione</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Início<input required type="datetime-local" name="startsAt" className="block rounded border p-2"/></label><label>Término<input required type="datetime-local" name="endsAt" className="block rounded border p-2"/></label><p>Inclusão exige permissão de cadastro no módulo RH.</p></SstForm>}<section className="space-y-2 rounded border p-4">{shifts.map((shift) => <p key={shift.id}>{shift.employee.name} · {shift.startsAt.toLocaleString("pt-BR")} — {shift.endsAt.toLocaleString("pt-BR")}</p>)}<ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/></section></div>;
}
