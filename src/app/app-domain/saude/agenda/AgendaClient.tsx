"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, MoreHorizontal, Search, X } from "lucide-react";
import { HealthFeedback } from "../HealthPageTools";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "@/components/app-ui/operational/operational.module.css";
import { createHealthAppointmentAction, transitionHealthAppointmentAction } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../operational-columns";

type Appointment = {
  id: string;
  date: string;
  specialty: string | null;
  specialtyRef: { name: string } | null;
  priority: string;
  status: string;
  patient: { id: string; person: { fullName: string } };
  unit: { name: string };
  professional: { employee: { name: string } } | null;
};

type Patient = { id: string; person: { fullName: string }; cns: string | null };
type Unit = { id: string; name: string };
type Professional = { id: string; unitId: string | null; specialty: string | null; employee: { name: string } };

type AppointmentForm = {
  patientId: string;
  unitId: string;
  professionalId: string;
  date: string;
  specialty: string;
  schedulingGroupId: string;
  specialtyId: string;
  serviceId: string;
  priority: "Normal" | "Prioridade" | "Urgência";
};

function currentLocalDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function initialForm(patients: Patient[], units: Unit[]): AppointmentForm {
  return {
    patientId: patients[0]?.id || "",
    unitId: units[0]?.id || "",
    professionalId: "",
    date: currentLocalDateTime(),
    specialty: "",
    schedulingGroupId: "",
    specialtyId: "",
    serviceId: "",
    priority: "Normal",
  };
}

export default function AgendaClient({
  appointments,
  patients,
  units,
  professionals,
  schedulingGroups,
  specialties,
  services,
  canCreate,
  canUpdate,
}: {
  appointments: Appointment[];
  patients: Patient[];
  units: Unit[];
  professionals: Professional[];
  schedulingGroups: { id: string; name: string; unitId: string; specialtyGroupId: string }[];
  specialties: { groupId: string; specialty: { id: string; name: string; unitLinks: { unitId: string }[] } }[];
  services: { groupId: string; service: { id: string; name: string; assignments: { unitId: string | null }[] } }[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AppointmentForm>(() => initialForm(patients, units));

  const filteredAppointments = appointments.filter(appointment => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (!term || [appointment.patient.person.fullName, appointment.unit.name, appointment.professional?.employee.name || "", appointment.specialty || "", appointment.status]
      .some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!statusFilter || appointment.status === statusFilter);
  });
  const statuses = Array.from(new Set(appointments.map((appointment) => appointment.status))).sort();
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE)));
  const visibleAppointments = filteredAppointments.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const availableProfessionals = professionals.filter(professional => !professional.unitId || professional.unitId === form.unitId);
  const availableGroups = schedulingGroups.filter(group => group.unitId === form.unitId);
  const selectedGroup = schedulingGroups.find(group => group.id === form.schedulingGroupId);
  const availableSpecialties = specialties.filter(item => item.groupId === selectedGroup?.specialtyGroupId && item.specialty.unitLinks.some(link => link.unitId === form.unitId));
  const availableServices = services.filter(item => item.groupId === selectedGroup?.specialtyGroupId && item.service.assignments.some(link => link.unitId === form.unitId));

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    setError("");
  }

  function openDialog() {
    setForm(initialForm(patients, units));
    setError("");
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await createHealthAppointmentAction({ ...form, professionalId: form.professionalId || null });
        if (result.error) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Nao foi possivel consultar a confirmacao. Tente novamente.");
      } finally {
        locked.current = false;
      }
    });
  }

  function changeStatus(appointmentId: string, status: "Confirmado" | "Aguardando" | "Em Atendimento" | "Faltou" | "Cancelado") {
    if (locked.current) return;
    const cancellationReason = status === "Cancelado" ? window.prompt("Informe o motivo do cancelamento:")?.trim() || "" : null;
    if (status === "Cancelado" && !cancellationReason) return;
    locked.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await transitionHealthAppointmentAction({ appointmentId, status, cancellationReason });
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Nao foi possivel consultar a confirmacao. Tente novamente.");
      } finally {
        locked.current = false;
      }
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <HealthFeedback message={error} error />
      <OperationalListFrame label="Agendamentos" toolbar={<>
        <label className="relative block max-w-md flex-1">
          <span className="sr-only">Buscar agendamentos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar paciente, unidade ou profissional" className="h-8 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" />
        </label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as situações</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
        {canCreate && <OperationalHeaderActions><button type="button" onClick={openDialog} disabled={!patients.length || !units.length || pending} className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs"><CalendarPlus className="size-4" />Novo agendamento</button></OperationalHeaderActions>}
      </>} pagination={<OperationalPagination page={activePage} total={filteredAppointments.length} onPageChange={setPage} />}>
          <OperationalTable preferenceId="saude-agenda" caption="Agendamentos" columns={[healthColumn("date", "Data e hora", 170, 125), healthColumn("patient", "Paciente", 240, 120), healthColumn("unit", "Unidade", 180, 100), healthColumn("professional", "Profissional", 200, 110), healthColumn("specialty", "Especialidade", 180, 100), healthColumn("status", "Situação", 120, 90, "status"), ...(canUpdate ? [healthColumn("actions", "Ações", 48, 48, "actions", "right", 64)] : [])]} rows={visibleAppointments.map(appointment => ({ id: appointment.id, label: appointment.patient.person.fullName, values: { date: new Date(appointment.date).toLocaleString("pt-BR"), patient: appointment.patient.person.fullName, unit: appointment.unit.name, professional: appointment.professional?.employee.name || "Não definido", specialty: appointment.specialtyRef?.name || appointment.specialty || "—", status: appointment.status }, actions: canUpdate && <div className={styles.rowActions}><DropdownMenu><DropdownMenuTrigger render={<button type="button" className={styles.iconButton} disabled={pending} aria-label={`Ações do agendamento de ${appointment.patient.person.fullName}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end">
                     {["Aguardando", "Em Atendimento", "Atendido"].includes(appointment.status) && <DropdownMenuItem render={<Link href={`/saude/vacinacao/carteira/${encodeURIComponent(appointment.patient.id)}?appointmentId=${encodeURIComponent(appointment.id)}`} />}>Vacinação</DropdownMenuItem>}
                     {appointment.status === "Agendado" && <DropdownMenuItem disabled={pending} onClick={() => changeStatus(appointment.id, "Confirmado")}>Confirmar</DropdownMenuItem>}
                     {["Agendado", "Confirmado"].includes(appointment.status) && <DropdownMenuItem disabled={pending} onClick={() => changeStatus(appointment.id, "Aguardando")}>Chegou</DropdownMenuItem>}
                     {["Agendado", "Confirmado", "Aguardando"].includes(appointment.status) && <DropdownMenuItem disabled={pending} onClick={() => changeStatus(appointment.id, "Faltou")}>Faltou</DropdownMenuItem>}
                     {["Agendado", "Confirmado", "Aguardando"].includes(appointment.status) && <DropdownMenuItem disabled={pending} onClick={() => changeStatus(appointment.id, "Cancelado")}>Cancelar</DropdownMenuItem>}
                   </DropdownMenuContent></DropdownMenu></div> }))} />
      </OperationalListFrame>

      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl" aria-labelledby="new-appointment-title">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="new-appointment-title" className="text-base font-semibold text-slate-900">Novo agendamento</h2><p className="mt-1 text-sm text-slate-500">O agendamento e confirmado somente depois da validacao no servidor.</p></div><button type="button" onClick={closeDialog} disabled={pending} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="size-5" /></button></header>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-slate-700">Paciente</span><select required value={form.patientId} onChange={event => setForm(current => ({ ...current, patientId: event.target.value }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"><option value="" disabled>Selecione um paciente</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.person.fullName}{patient.cns ? ` - CNS ${patient.cns}` : ""}</option>)}</select></label>
             <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Unidade</span><select required value={form.unitId} onChange={event => setForm(current => ({ ...current, unitId: event.target.value, professionalId: "", schedulingGroupId: "", specialtyId: "", serviceId: "" }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"><option value="" disabled>Selecione uma unidade</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Profissional</span><select value={form.professionalId} onChange={event => setForm(current => ({ ...current, professionalId: event.target.value }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"><option value="">Definir posteriormente</option>{availableProfessionals.map(professional => <option key={professional.id} value={professional.id}>{professional.employee.name}{professional.specialty ? ` - ${professional.specialty}` : ""}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Data e hora</span><input required type="datetime-local" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Prioridade administrativa</span><select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as AppointmentForm["priority"] }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"><option value="Normal">Normal</option><option value="Prioridade">Prioridade</option><option value="Urgência">Urgencia</option></select></label>
             <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Grupo de agendamento</span><select value={form.schedulingGroupId} onChange={event => setForm(current => ({ ...current, schedulingGroupId: event.target.value, specialtyId: "", serviceId: "" }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Não informado</option>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
             <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Especialidade</span><select value={form.specialtyId} onChange={event => setForm(current => ({ ...current, specialtyId: event.target.value, specialty: availableSpecialties.find(item => item.specialty.id === event.target.value)?.specialty.name || "" }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Não informada</option>{availableSpecialties.map(item => <option key={item.specialty.id} value={item.specialty.id}>{item.specialty.name}</option>)}</select></label>
             <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-slate-700">Serviço</span><select value={form.serviceId} onChange={event => setForm(current => ({ ...current, serviceId: event.target.value }))} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Não informado</option>{availableServices.map(item => <option key={item.service.id} value={item.service.id}>{item.service.name}</option>)}</select></label>
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"><button type="button" onClick={closeDialog} disabled={pending} className="min-h-11 rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">Cancelar</button><button type="submit" disabled={pending} className="min-h-11 rounded bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Confirmando..." : "Confirmar agendamento"}</button></footer>
        </form>
      </div>}
    </div>
  );
}
