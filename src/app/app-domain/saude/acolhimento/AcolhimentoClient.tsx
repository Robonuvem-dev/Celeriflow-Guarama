"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Megaphone, UserPlus, X } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../operational-columns";
import { HealthFeedback, HealthPageTools } from "../HealthPageTools";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { callHealthAppointmentAction, createSpontaneousCareAction, registerHealthTriageAction } from "./actions";

type Appointment = { id: string; date: string; origin: string; status: string; priority: string; arrivedAt: string | null; calledAt: string | null; patient: { person: { fullName: string } }; unit: { name: string }; triage: { riskClassification: string; chiefComplaint: string } | null };
type Patient = { id: string; cns: string | null; person: { fullName: string } };
type Unit = { id: string; name: string };
const riskOrder: Record<string, number> = { Emergência: 0, "Muita urgência": 1, Urgente: 2, "Pouco urgente": 3, "Não urgente": 4 };
const field = "min-h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15";

export default function AcolhimentoClient({ appointments, patients, units, canCreate, canUpdate, hasProfessional }: { appointments: Appointment[]; patients: Patient[]; units: Unit[]; canCreate: boolean; canUpdate: boolean; hasProfessional: boolean }) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"arrival" | "triage" | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const queue = [...appointments].sort((a, b) => (riskOrder[a.triage?.riskClassification || ""] ?? 9) - (riskOrder[b.triage?.riskClassification || ""] ?? 9) || new Date(a.arrivedAt || a.date).getTime() - new Date(b.arrivedAt || b.date).getTime());

  function execute(operation: () => Promise<{ error?: string }>, close = true) {
    if (locked.current) return;
    locked.current = true; setError("");
    startTransition(async () => { try { const result = await operation(); if (result.error) { setError(result.error); return; } if (close) setDialog(null); router.refresh(); } catch { setError("Não foi possível consultar a confirmação. Tente novamente."); } finally { locked.current = false; } });
  }

  function arrival(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    execute(() => createSpontaneousCareAction({ patientId: data.get("patientId"), unitId: data.get("unitId"), professionalId: null, specialtyId: null, serviceId: null, arrivalNotes: data.get("arrivalNotes"), priority: data.get("priority") }));
  }

  function triage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const number = (key: string) => data.get(key) ? Number(String(data.get(key)).replace(",", ".")) : null;
    execute(() => registerHealthTriageAction({ appointmentId: selected, chiefComplaint: data.get("chiefComplaint"), bloodPressure: data.get("bloodPressure") || null, temperature: number("temperature"), weight: number("weight"), height: number("height"), heartRate: number("heartRate"), respiratoryRate: number("respiratoryRate"), oxygenSaturation: number("oxygenSaturation"), bloodGlucose: number("bloodGlucose"), observedConditions: data.get("observedConditions") || null, riskClassification: data.get("riskClassification"), priorityLabel: data.get("riskClassification"), notes: data.get("notes") || null }));
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <HealthFeedback message={error} error />
    <OperationalHeaderActions>{canCreate && <button disabled={pending || !patients.length || !units.length} onClick={() => setDialog("arrival")} className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs"><UserPlus className="size-4" />Demanda espontânea</button>}</OperationalHeaderActions><HealthPageTools label="Contexto da fila"><div><h2 className="text-sm font-semibold">Fila da unidade</h2><p className="text-xs text-slate-500">Ordenação por risco e horário de chegada.</p></div>
    {canUpdate && !hasProfessional && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">O acolhimento clínico exige vínculo ativo do usuário com um profissional de saúde.</p>}
    </HealthPageTools><OperationalListFrame label="Fila de acolhimento" pagination={<OperationalPagination page={Math.min(page, Math.max(1, Math.ceil(queue.length / OPERATIONAL_PAGE_SIZE)))} total={queue.length} onPageChange={setPage} pending={pending} />}>
      <OperationalTable preferenceId="saude-acolhimento" caption="Fila por risco e chegada" columns={[healthColumn("arrival", "Chegada", 100, 75), healthColumn("patient", "Paciente", 240, 120), healthColumn("origin", "Origem", 100, 75), healthColumn("unit", "Unidade", 180, 100), healthColumn("risk", "Risco", 150, 100), healthColumn("complaint", "Queixa", 240, 110), healthColumn("actions", "Ações", 165, 165, "actions", "right", 180)]} rows={queue.slice((Math.min(page, Math.max(1, Math.ceil(queue.length / OPERATIONAL_PAGE_SIZE))) - 1) * OPERATIONAL_PAGE_SIZE, Math.min(page, Math.max(1, Math.ceil(queue.length / OPERATIONAL_PAGE_SIZE))) * OPERATIONAL_PAGE_SIZE).map(item => ({ id: item.id, label: item.patient.person.fullName, values: { arrival: new Date(item.arrivedAt || item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), patient: item.patient.person.fullName, origin: item.origin === "SPONTANEOUS" ? "PA" : "Agenda", unit: item.unit.name, risk: item.triage?.riskClassification || "Aguardando", complaint: item.triage?.chiefComplaint || "—" }, actions: <div className="flex items-center justify-end gap-1">{canUpdate && hasProfessional && <button disabled={pending} onClick={() => { setSelected(item.id); setDialog("triage"); }}><HeartPulse className="mr-1 inline size-4" />Acolher</button>}{canUpdate && item.triage && <button disabled={pending} onClick={() => execute(() => callHealthAppointmentAction(item.id), false)}><Megaphone className="mr-1 inline size-4" />Chamar</button>}</div> }))} />
    </OperationalListFrame>
    {dialog === "arrival" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={arrival} className="w-full max-w-xl rounded-lg bg-white shadow-xl"><header className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Entrada por demanda espontânea</h2><p className="text-sm text-slate-500">Registre a procura para inclusão imediata na fila.</p></div><button type="button" onClick={() => setDialog(null)}><X className="size-5" /></button></header><div className="grid gap-4 p-4 md:grid-cols-2"><label className="md:col-span-2 text-sm font-medium">Paciente<select required name="patientId" className={`mt-1 ${field}`}><option value="">Selecione</option>{patients.map(item => <option key={item.id} value={item.id}>{item.person.fullName}{item.cns ? ` · CNS ${item.cns}` : ""}</option>)}</select></label><label className="text-sm font-medium">Unidade<select required name="unitId" className={`mt-1 ${field}`}><option value="">Selecione</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">Prioridade administrativa<select name="priority" className={`mt-1 ${field}`}><option>Normal</option><option>Prioridade</option><option>Urgência</option></select></label><label className="md:col-span-2 text-sm font-medium">Motivo da procura<textarea required name="arrivalNotes" rows={4} maxLength={2000} className={`mt-1 py-2 ${field}`} /></label></div><footer className="flex justify-end gap-2 border-t p-3"><button type="button" onClick={() => setDialog(null)} className="min-h-10 rounded border px-3">Cancelar</button><button disabled={pending} className="min-h-10 rounded bg-rose-700 px-4 font-semibold text-white">Incluir na fila</button></footer></form></div>}
    {dialog === "triage" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={triage} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl"><header className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Ficha de acolhimento</h2><p className="text-sm text-slate-500">Sinais vitais e classificação de risco ficam vinculados ao episódio.</p></div><button type="button" onClick={() => setDialog(null)}><X className="size-5" /></button></header><div className="grid gap-3 p-4 md:grid-cols-4"><label className="md:col-span-4 text-sm font-medium">Queixa principal<textarea required name="chiefComplaint" rows={3} maxLength={2000} className={`mt-1 py-2 ${field}`} /></label>{[["bloodPressure", "Pressão arterial"], ["temperature", "Temperatura (°C)"], ["weight", "Peso (kg)"], ["height", "Altura (m)"], ["heartRate", "Freq. cardíaca"], ["respiratoryRate", "Freq. respiratória"], ["oxygenSaturation", "Saturação (%)"], ["bloodGlucose", "Glicemia"]].map(([name, label]) => <label key={name} className="text-sm font-medium">{label}<input name={name} inputMode="decimal" className={`mt-1 ${field}`} /></label>)}<label className="md:col-span-2 text-sm font-medium">Classificação de risco<select required name="riskClassification" className={`mt-1 ${field}`}><option>Não urgente</option><option>Pouco urgente</option><option>Urgente</option><option>Muita urgência</option><option>Emergência</option></select></label><label className="md:col-span-2 text-sm font-medium">Condições observadas<input name="observedConditions" maxLength={5000} className={`mt-1 ${field}`} /></label><label className="md:col-span-4 text-sm font-medium">Observações<textarea name="notes" rows={3} maxLength={5000} className={`mt-1 py-2 ${field}`} /></label></div><footer className="flex justify-end gap-2 border-t p-3"><button type="button" onClick={() => setDialog(null)} className="min-h-10 rounded border px-3">Cancelar</button><button disabled={pending} className="min-h-10 rounded bg-emerald-700 px-4 font-semibold text-white">Salvar acolhimento</button></footer></form></div>}
  </div>;
}
