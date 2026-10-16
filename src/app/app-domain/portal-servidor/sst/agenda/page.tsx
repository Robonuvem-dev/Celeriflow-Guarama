import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnMedicalAgenda } from "@/lib/portal-servidor/medical-agenda";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OwnAgendaForm, OwnAppointmentCancellation } from "./AgendaForm";

export const dynamic = "force-dynamic";
export default async function OwnMedicalAgenda({ searchParams }: { searchParams: Promise<{ page?: string; appointmentsPage?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams;
  const agenda = await listOwnMedicalAgenda(access.context, Number.parseInt(params.page || "1") || 1);
  const where = { employeeId: access.employee.id };
  const total = await access.context.prisma.sstAppointment.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.appointmentsPage || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const appointments = await access.context.prisma.sstAppointment.findMany({ where, include: { availability: { select: { unitName: true, professional: { select: { fullName: true } } } } }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  const href = (windowsPage: number, appointmentsPage: number) => `?${new URLSearchParams({ page: String(windowsPage), appointmentsPage: String(appointmentsPage) })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Minha agenda SST" description="Agende consultas, exames e perícias nas disponibilidades da sua unidade." />{agenda.windows.length ? <OwnAgendaForm key={agenda.page} windows={agenda.windows} /> : <p className="rounded border border-slate-300 bg-white p-4 text-sm">Nenhuma disponibilidade cadastrada para seu vínculo.</p>}<ErpPagination page={agenda.page} total={agenda.total} pageSize={10} label="agendas" previousHref={href(agenda.page - 1, page)} nextHref={href(agenda.page + 1, page)} />
    <h2 className="text-sm font-semibold">Meus agendamentos</h2>{appointments.map(appointment => <article key={appointment.id} className="rounded border border-slate-300 bg-white p-3 text-xs"><p className="font-semibold">{appointment.startsAt.toLocaleString("pt-BR")} · {appointment.purpose} · {appointment.status}</p><p>{appointment.availability.unitName} · {appointment.availability.professional.fullName}</p><a className="mt-2 inline-block font-semibold text-emerald-800 underline" href={`/api/portal-servidor/sst/agenda/${appointment.id}`}>Emitir comprovante</a>{appointment.status === "BOOKED" && <OwnAppointmentCancellation id={appointment.id} />}{appointment.cancellationReason && <p className="mt-2">Motivo do cancelamento: {appointment.cancellationReason}</p>}</article>)}<ErpPagination page={page} total={total} pageSize={20} label="agendamentos" previousHref={href(agenda.page, page - 1)} nextHref={href(agenda.page, page + 1)} />
  </div>;
}
