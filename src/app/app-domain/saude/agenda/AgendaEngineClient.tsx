"use client";

import { useState, useTransition } from "react";
import { addWaitlistAction, remanejarAppointmentAction, saveScheduleAction, transitionScheduleAction, transitionWaitlistAction } from "./schedule-actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { HealthFeedback, HealthPageTools } from "../HealthPageTools";
import { HealthReadTable } from "../HealthReadTable";
import { healthColumn } from "../operational-columns";

type Schedule = { id: string; kind: string; unit: string; specialty: string | null; professional: string | null; when: string; slots: string; status: string };
type WaitEntry = { id: string; patient: string; specialty: string | null; priority: string; status: string; createdAt: string };
type Slim = { id: string; label: string };
type Drafts = Record<string, Record<string, string>>;
const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const btn = "h-8 rounded bg-emerald-700 px-2 font-semibold text-white text-xs";

export default function AgendaEngineClient({ schedules, waitlist, patients, units, professionals, specialties, appointments, canCreate, canUpdate }: {
  schedules: Schedule[]; waitlist: WaitEntry[]; patients: Slim[]; units: Slim[]; professionals: Slim[]; specialties: Slim[]; appointments: Slim[]; canCreate: boolean; canUpdate: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  // This component stays mounted outside the overlays. Drafts survive closing
  // tools, changing the table page and opening the full-screen list panels.
  const [drafts, setDrafts] = useState<Drafts>({});
  const value = (key: string, name: string, fallback = "") => drafts[key]?.[name] ?? fallback;
  const update = (key: string, name: string, next: string) => setDrafts(current => ({ ...current, [key]: { ...current[key], [name]: next } }));
  const run = (action: () => Promise<{ error?: string }>, draftKey?: string) => start(async () => {
    setError("");
    const result = await action();
    if (result?.error) { setError(result.error); return; }
    if (draftKey) setDrafts(current => { const next = { ...current }; delete next[draftKey]; return next; });
  });

  return <><HealthFeedback message={error} error /><HealthPageTools label="Cronogramas, espera e remanejo">
    <details className="rounded border bg-white p-2 text-xs"><summary>Cadastrar cronograma</summary>
      {canCreate && <form action={data => run(async () => saveScheduleAction({ kind: String(data.get("kind")), unitId: String(data.get("unitId")), specialtyId: String(data.get("specialtyId")) || null, professionalId: String(data.get("professionalId")) || null, weekday: data.get("weekday") === "" ? null : Number(data.get("weekday")), date: String(data.get("date")) || null, startTime: String(data.get("startTime")) || null, endTime: String(data.get("endTime")) || null, totalSlots: Number(data.get("totalSlots")) }), "schedule")} className="mt-2 grid gap-1">
        <div className="grid grid-cols-2 gap-1"><select aria-label="Tipo de cronograma" name="kind" value={value("schedule", "kind", "FIXO")} onChange={event => update("schedule", "kind", event.target.value)} className={field}><option value="FIXO">Fixo</option><option value="DIARIO">Diário</option></select><input aria-label="Vagas do cronograma" name="totalSlots" type="number" min="1" required placeholder="Vagas" value={value("schedule", "totalSlots")} onChange={event => update("schedule", "totalSlots", event.target.value)} className={field} /></div>
        <select aria-label="Unidade do cronograma" name="unitId" required value={value("schedule", "unitId")} onChange={event => update("schedule", "unitId", event.target.value)} className={field}><option value="">Unidade</option>{units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <select aria-label="Especialidade do cronograma" name="specialtyId" value={value("schedule", "specialtyId")} onChange={event => update("schedule", "specialtyId", event.target.value)} className={field}><option value="">Especialidade</option>{specialties.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select aria-label="Profissional do cronograma" name="professionalId" value={value("schedule", "professionalId")} onChange={event => update("schedule", "professionalId", event.target.value)} className={field}><option value="">Profissional</option>{professionals.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <div className="grid grid-cols-2 gap-1"><select aria-label="Dia fixo" name="weekday" value={value("schedule", "weekday")} onChange={event => update("schedule", "weekday", event.target.value)} className={field}><option value="">Dia (fixo)</option>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select><input aria-label="Data do cronograma" name="date" type="date" value={value("schedule", "date")} onChange={event => update("schedule", "date", event.target.value)} className={field} /></div>
        <div className="grid grid-cols-2 gap-1"><input aria-label="Início do cronograma" name="startTime" type="time" value={value("schedule", "startTime")} onChange={event => update("schedule", "startTime", event.target.value)} className={field} /><input aria-label="Fim do cronograma" name="endTime" type="time" value={value("schedule", "endTime")} onChange={event => update("schedule", "endTime", event.target.value)} className={field} /></div>
        <button className={btn} disabled={pending}>Salvar cronograma</button>
      </form>}
    </details>
    <OperationalTablePanel title="Cronogramas e vagas" triggerLabel={`Consultar ${schedules.length} cronogramas`}>
      <HealthReadTable id="saude-agenda-cronogramas" label="Cronogramas e vagas" columns={[healthColumn("kind", "Tipo", 100, 70), healthColumn("when", "Quando", 140, 90), healthColumn("unit", "Unidade", 180, 100), healthColumn("specialty", "Especialidade", 160, 100), healthColumn("professional", "Profissional", 180, 100), healthColumn("slots", "Vagas", 90, 65), healthColumn("status", "Situação", 110, 80, "status"), ...(canUpdate ? [healthColumn("reason", "Motivo do bloqueio", 200, 140), healthColumn("actions", "Ação", 85, 80, "actions", "right", 100)] : [])]} rows={schedules.map(s => ({ id: s.id, label: `${s.kind} ${s.when}`, values: { kind: s.kind, when: s.when, unit: s.unit, specialty: s.specialty || "—", professional: s.professional || "—", slots: s.slots, status: s.status, reason: value(`block:${s.id}`, "reason") }, cells: { reason: canUpdate && s.status === "Ativo" ? <input form={`block-schedule-${s.id}`} name="reason" required aria-label={`Motivo do bloqueio de ${s.id}`} value={value(`block:${s.id}`, "reason")} onChange={event => update(`block:${s.id}`, "reason", event.target.value)} /> : null }, actions: canUpdate && s.status === "Ativo" && <form id={`block-schedule-${s.id}`} action={data => run(async () => transitionScheduleAction(s.id, "Bloqueado", String(data.get("reason"))), `block:${s.id}`)}><button disabled={pending}>Bloquear</button></form> }))} />
    </OperationalTablePanel>
    <details className="rounded border bg-white p-2 text-xs"><summary>Incluir na espera</summary>
      {canCreate && <form action={data => run(async () => addWaitlistAction({ patientId: String(data.get("patientId")), specialtyId: String(data.get("specialtyId")) || null, scheduleId: String(data.get("scheduleId")) || null, priority: String(data.get("priority")), notes: String(data.get("notes")) || null }), "wait")} className="mt-2 grid gap-1">
        <select aria-label="Paciente da espera" name="patientId" required value={value("wait", "patientId")} onChange={event => update("wait", "patientId", event.target.value)} className={field}><option value="">Paciente</option>{patients.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <div className="grid grid-cols-2 gap-1"><select aria-label="Especialidade da espera" name="specialtyId" value={value("wait", "specialtyId")} onChange={event => update("wait", "specialtyId", event.target.value)} className={field}><option value="">Especialidade</option>{specialties.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select><select aria-label="Prioridade da espera" name="priority" value={value("wait", "priority", "Normal")} onChange={event => update("wait", "priority", event.target.value)} className={field}><option>Normal</option><option>Prioridade</option><option>Urgência</option></select></div>
        <button className={btn} disabled={pending}>Incluir na espera</button>
      </form>}
    </details>
    <OperationalTablePanel title="Lista de espera" triggerLabel={`Consultar ${waitlist.length} esperas`}>
      <HealthReadTable id="saude-agenda-esperas" label="Lista de espera" columns={[healthColumn("patient", "Paciente", 260, 120), healthColumn("specialty", "Especialidade", 220, 110), healthColumn("priority", "Prioridade", 130, 90), healthColumn("status", "Situação", 130, 90, "status"), healthColumn("createdAt", "Entrada", 160, 100), healthColumn("actions", "Ações", 150, 140, "actions", "right", 170)]} rows={waitlist.map(w => ({ id: w.id, label: w.patient, values: { patient: w.patient, specialty: w.specialty || "—", priority: w.priority, status: w.status, createdAt: w.createdAt }, actions: canUpdate && w.status === "Aguardando" && <div className="flex gap-2"><button disabled={pending} onClick={() => run(async () => transitionWaitlistAction(w.id, "Chamado"))}>Chamar</button><button disabled={pending} onClick={() => run(async () => transitionWaitlistAction(w.id, "Cancelado"))}>Cancelar</button></div> }))} />
    </OperationalTablePanel>
    <details className="rounded border bg-white p-2 text-xs"><summary>Remanejar agendamento</summary>
      {canUpdate && <form action={data => run(async () => remanejarAppointmentAction({ appointmentId: String(data.get("appointmentId")), date: String(data.get("date")), professionalId: String(data.get("professionalId")) || null, reason: String(data.get("reason")) }), "move")} className="mt-2 grid gap-1">
        <select aria-label="Agendamento para remanejo" name="appointmentId" required value={value("move", "appointmentId")} onChange={event => update("move", "appointmentId", event.target.value)} className={field}><option value="">Agendamento</option>{appointments.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <input aria-label="Data do remanejo" name="date" type="datetime-local" required value={value("move", "date")} onChange={event => update("move", "date", event.target.value)} className={field} />
        <select aria-label="Profissional do remanejo" name="professionalId" value={value("move", "professionalId")} onChange={event => update("move", "professionalId", event.target.value)} className={field}><option value="">Manter profissional</option>{professionals.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <input aria-label="Motivo do remanejo" name="reason" required placeholder="Motivo" value={value("move", "reason")} onChange={event => update("move", "reason", event.target.value)} className={field} />
        <button className={btn} disabled={pending}>Confirmar remanejo</button>
      </form>}
      {error && <p role="alert" className="mt-2 text-rose-600">{error}</p>}
    </details>
  </HealthPageTools></>;
}
