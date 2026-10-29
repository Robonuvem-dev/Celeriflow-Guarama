"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardPlus, Search } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { HealthFeedback, HealthPageTools } from "../HealthPageTools";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../operational-columns";
import { startHealthCareAction } from "./actions";

type MedicalRecord = {
  id: string;
  date: string;
  type: string;
  chiefComplaint: string | null;
  completedAt: string | null;
  outcome: string | null;
  patient: { person: { fullName: string } };
  professional: { employee: { name: string } };
  unit: { name: string };
};

type Appointment = {
  id: string;
  date: string;
  specialty: string | null;
  status: string;
  patient: { person: { fullName: string } };
  unit: { name: string };
  professionalId: string | null;
  medicalRecord: { id: string } | null;
};

type CurrentProfessional = { id: string; name: string } | null;

export default function AtendimentosClient({
  records,
  appointments,
  currentProfessional,
  canRegister,
}: {
  records: MedicalRecord[];
  appointments: Appointment[];
  currentProfessional: CurrentProfessional;
  canRegister: boolean;
}) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredRecords = records.filter((record) => {
    const matchesType = !typeFilter || record.type === typeFilter;
    const haystack = [record.type, record.patient.person.fullName, record.unit.name, record.professional.employee.name, record.chiefComplaint || ""].join(" ").toLocaleLowerCase("pt-BR");
    return matchesType && (!normalizedSearch || haystack.includes(normalizedSearch));
  });
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const visibleRecords = filteredRecords.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const recordTypes = [...new Set(records.map((record) => record.type))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  function start(appointmentId: string) {
    if (locked.current) return;
    locked.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await startHealthCareAction(appointmentId);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.id) router.push(`/saude/atendimentos/${result.id}`);
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
      <HealthPageTools label="Iniciar atendimento"><div className="grid gap-2 text-sm">
        <div><h2 className="text-sm font-semibold text-slate-900">Atendimentos e prontuarios</h2><p className="mt-1 text-sm text-slate-500">O registro preserva a autoria do profissional autenticado e conclui o agendamento uma unica vez.</p></div>
        {canRegister && currentProfessional && appointments.length > 0 && <span className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ClipboardPlus className="size-4" />{appointments.length} paciente(s) disponível(is)</span>}
      </div>
      {canRegister && !currentProfessional && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O registro clinico exige que o usuario autenticado esteja vinculado a um profissional de saude ativo.</p>}
      {canRegister && currentProfessional && !appointments.length && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Nao ha agendamentos elegiveis para o profissional autenticado.</p>}
      {canRegister && currentProfessional && appointments.length > 0 && <div className="shrink-0 overflow-x-auto rounded border bg-white p-2"><div className="flex min-w-max gap-2">{appointments.map(appointment => <button key={appointment.id} disabled={pending} onClick={() => appointment.medicalRecord ? router.push(`/saude/atendimentos/${appointment.medicalRecord.id}`) : start(appointment.id)} className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs hover:bg-emerald-100"><strong className="block text-emerald-950">{appointment.patient.person.fullName}</strong><span className="text-emerald-800">{appointment.status} · {appointment.unit.name}</span></button>)}</div></div>}

      </HealthPageTools><OperationalListFrame
        toolbar={<div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_11rem]"><label className="relative"><span className="sr-only">Buscar atendimentos</span><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar paciente, unidade ou profissional" className="h-8 w-full rounded border border-slate-200 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-emerald-600" /></label><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="h-8 rounded border border-slate-200 px-2 text-xs"><option value="">Todos os tipos</option>{recordTypes.map((type) => <option key={type}>{type}</option>)}</select></div>}
        pagination={<OperationalPagination page={activePage} total={filteredRecords.length} onPageChange={setPage} />}
      >
        <OperationalTable preferenceId="saude-atendimentos" caption="Atendimentos" columns={[healthColumn("date", "Data", 170, 125), healthColumn("type", "Tipo", 120, 80), healthColumn("patient", "Paciente", 240, 120), healthColumn("unit", "Unidade", 180, 100), healthColumn("professional", "Profissional", 200, 110), healthColumn("outcome", "Desfecho", 150, 100), healthColumn("actions", "Prontuário", 85, 85, "actions", "right", 100)]} rows={visibleRecords.map(record => ({ id: record.id, label: record.patient.person.fullName, values: { date: new Date(record.date).toLocaleString("pt-BR"), type: record.type, patient: record.patient.person.fullName, unit: record.unit.name, professional: record.professional.employee.name, outcome: record.outcome || (record.completedAt ? "Concluído" : "Em atendimento") }, actions: <Link href={`/saude/atendimentos/${record.id}`} aria-label={`Abrir prontuário de ${record.patient.person.fullName}`}>Abrir</Link> }))} />
      </OperationalListFrame>

    </div>
  );
}
