"use client";

import { useState } from "react";
import type { readControlAgenda } from "@/lib/c7/control-agenda";
import { scheduleControlObligationAction, completeControlObligationAction, runControlAgendaAlertsAction } from "./actions";

type Form = { planId: string; title: string; description: string; dueAt: string; criticality: "BAIXA" | "MEDIA" | "ALTA"; alertDays: number; expirationDays: number; viewerIds: string[]; closerIds: string[]; costCenterId: string };
const empty: Form = { planId: "", title: "", description: "", dueAt: "", criticality: "MEDIA", alertDays: 7, expirationDays: 0, viewerIds: [], closerIds: [], costCenterId: "" };

export function ControlAgendaClient({ agenda, plans, recipients, centers, userId }: { agenda: Awaited<ReturnType<typeof readControlAgenda>>; plans: Array<{ id: string; title: string; ownerId: string; status: string; budgetUnitId: string | null }>; recipients: Array<{ id: string; name: string; budgetUnitIds: string[] }>; centers: Array<{ id: string; name: string; budgetUnitIds: string[] }>; userId: string }) {
  const [form, setForm] = useState<Form>(empty);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [period, setPeriod] = useState("MENSAL");
  const [reference, setReference] = useState(new Date().toISOString().slice(0, 10));
  const [completion, setCompletion] = useState({ obligationId: "", reason: "" });
  const plan = plans.find(plan => plan.id === form.planId);
  const update = (change: Partial<Form>) => { setKey(""); setForm({ ...form, ...change }); };
  async function run(action: () => Promise<{ error?: string }>, reset?: () => void) { setPending(true); setError(""); try { const result = await action(); if (result.error) setError(result.error); else reset?.(); } catch { setError("Não foi possível concluir a operação."); } finally { setPending(false); } }
  const start = new Date(`${reference}T00:00:00Z`);
  let end = new Date(start);
  if (period === "ANUAL") { start.setUTCMonth(0, 1); end = new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1)); }
  else if (period === "MENSAL") { start.setUTCDate(1); end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); }
  else if (period === "SEMANAL") { start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7); end = new Date(start.getTime() + 7 * 86400000); }
  else end = new Date(start.getTime() + 86400000);
  const rows = agenda.filter(item => (!onlyPending || !item.completion) && new Date(item.dueAt) >= start && new Date(item.dueAt) < end);
  return <section className="space-y-4 rounded border bg-white p-5">
    <h2 className="text-lg font-semibold">Agenda de obrigações</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); const idempotencyKey = key || crypto.randomUUID(); setKey(idempotencyKey); void run(() => scheduleControlObligationAction({ ...form, costCenterId: form.costCenterId || undefined, idempotencyKey }), () => { setForm(empty); setKey(""); }); }}>
      <select required aria-label="Plano da obrigação" className="rounded border p-2" value={form.planId} onChange={event => update({ planId: event.target.value, viewerIds: [], closerIds: [], costCenterId: "" })}><option value="">Plano sob sua responsabilidade</option>{plans.filter(plan => plan.ownerId === userId && plan.status === "ABERTO").map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select>
      <input required placeholder="Título da obrigação" className="rounded border p-2" value={form.title} onChange={event => update({ title: event.target.value })} />
      <textarea required placeholder="Descrição da obrigação" className="rounded border p-2 md:col-span-2" value={form.description} onChange={event => update({ description: event.target.value })} />
      <input required type="date" aria-label="Prazo da obrigação" className="rounded border p-2" value={form.dueAt} onChange={event => update({ dueAt: event.target.value })} />
      <select aria-label="Criticidade" className="rounded border p-2" value={form.criticality} onChange={event => update({ criticality: event.target.value as Form["criticality"] })}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select>
      <label className="grid gap-1 text-sm">Antecedência do alerta (dias)<input type="number" min={0} max={365} required className="rounded border p-2" value={form.alertDays} onChange={event => update({ alertDays: Number(event.target.value) })} /></label>
      <label className="grid gap-1 text-sm">Expiração após o prazo (dias)<input type="number" min={0} max={365} required className="rounded border p-2" value={form.expirationDays} onChange={event => update({ expirationDays: Number(event.target.value) })} /></label>
      <label className="grid gap-1 text-sm">Usuários com visualização<select multiple className="rounded border p-2" value={form.viewerIds} onChange={event => update({ viewerIds: [...event.target.selectedOptions].map(option => option.value) })}>{recipients.filter(recipient => plan?.budgetUnitId && recipient.budgetUnitIds.includes(plan.budgetUnitId)).map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Usuários autorizados a baixar<select required multiple className="rounded border p-2" value={form.closerIds} onChange={event => update({ closerIds: [...event.target.selectedOptions].map(option => option.value) })}>{recipients.filter(recipient => plan?.budgetUnitId && recipient.budgetUnitIds.includes(plan.budgetUnitId)).map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}</option>)}</select></label>
      <select aria-label="Centro de custo com visualização" className="rounded border p-2" value={form.costCenterId} onChange={event => update({ costCenterId: event.target.value })}><option value="">Sem visualização adicional por centro</option>{centers.filter(center => plan?.budgetUnitId && center.budgetUnitIds.includes(plan.budgetUnitId)).map(center => <option key={center.id} value={center.id}>{center.name}</option>)}</select>
      <button disabled={pending} className="rounded bg-slate-900 p-2 text-white">Agendar obrigação</button>
    </form>
    <div className="flex flex-wrap gap-3 text-sm">
      <label><input type="checkbox" checked={onlyPending} onChange={event => setOnlyPending(event.target.checked)} /> Apenas pendentes</label>
      <select aria-label="Período da agenda" className="rounded border p-2" value={period} onChange={event => setPeriod(event.target.value)}><option value="DIARIO">Diário</option><option value="SEMANAL">Semanal</option><option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option></select>
      <input type="date" required aria-label="Data de referência da agenda" className="rounded border p-2" value={reference} onChange={event => setReference(event.target.value)} />
      <a className="p-2 underline" href={`/api/controle-interno/agenda?year=${reference.slice(0, 4)}&format=PDF`}>Calendário anual PDF</a>
      <a className="p-2 underline" href={`/api/controle-interno/agenda?year=${reference.slice(0, 4)}&months=${Number(reference.slice(5, 7))}&format=PDF`}>Calendário do mês PDF</a>
    </div>
    <div className="flex flex-wrap gap-2">{plans.filter(plan => plan.ownerId === userId && plan.status === "ABERTO").map(plan => <button key={plan.id} disabled={pending} className="rounded border p-2 text-sm" onClick={() => void run(() => runControlAgendaAlertsAction(plan.id))}>Processar alertas: {plan.title}</button>)}</div>
    {rows.map(item => <article key={item.id} className="space-y-1 rounded border p-3 text-sm"><h3 className="font-semibold">{item.title} · {item.criticality}</h3><p>{item.planTitle} · prazo {item.dueAt.slice(0, 10)} · {item.completion ? "Baixada" : "Pendente"}</p><p className="whitespace-pre-wrap">{item.description}</p>{!item.completion && item.alerts.map(alert => <p key={alert.id} role="status" className="text-amber-800">{alert.message} · {alert.at.slice(0, 10)}</p>)}{item.completion && <p>Baixa: {item.completion.at} · {item.completion.reason || "Sem justificativa exigida"}</p>}{!item.completion && item.canComplete && item.planStatus === "ABERTO" && <button className="rounded border p-2" onClick={() => setCompletion({ obligationId: item.id, reason: "" })}>Baixar obrigação</button>}</article>)}
    {!rows.length && <p className="text-sm text-muted-foreground">Nenhuma obrigação visível neste filtro.</p>}
    {completion.obligationId && <form className="grid gap-2 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(() => completeControlObligationAction(completion), () => setCompletion({ obligationId: "", reason: "" })); }}><h3 className="font-semibold">Baixa da obrigação</h3><textarea aria-label="Justificativa da baixa" placeholder="Obrigatória para criticidade média/alta ou obrigação expirada" className="rounded border p-2" value={completion.reason} onChange={event => setCompletion({ ...completion, reason: event.target.value })} /><button disabled={pending} className="rounded bg-emerald-700 p-2 text-white">Confirmar baixa</button></form>}
  </section>;
}
