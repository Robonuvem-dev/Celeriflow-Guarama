"use client";

import { useState } from "react";
import { sendControlNoticeAction, respondControlNoticeAction, reviewControlNoticeResponseAction } from "./actions";

type Plan = { id: string; title: string; ownerId: string; budgetUnitId: string | null; status: string; findings: Array<{ id: string; title: string; status: string }> };
type Notice = { id: string; planId: string; actorId: string; title: string; message: string; dueAt: string; recipientId: string; recipientName: string; documentIds: string[]; response: string | null; review: { reason: string; accepted: boolean } | null };

export function ControlNotificationsClient({ plans, notices, recipients, documents, userId }: { plans: Plan[]; notices: Notice[]; recipients: Array<{ id: string; name: string; budgetUnitIds: string[] }>; documents: Array<{ id: string; title: string }>; userId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [form, setForm] = useState({ planId: "", findingId: "", recipientId: "", title: "", message: "", dueAt: "", documentIds: [] as string[] });
  const [answer, setAnswer] = useState({ noticeId: "", response: "", documentIds: [] as string[] });
  const [review, setReview] = useState({ noticeId: "", accepted: true, reason: "" });
  const [pendingOnly, setPendingOnly] = useState(true);
  const selectedPlan = plans.find(plan => plan.id === form.planId);
  const inbox = notices.filter(notice => notice.recipientId === userId);
  const sent = notices.filter(notice => notice.actorId === userId || plans.some(plan => plan.id === notice.planId && plan.ownerId === userId));
  async function run(action: () => Promise<{ error?: string }>, reset: () => void) {
    setPending(true); setError("");
    try { const result = await action(); if (result.error) setError(result.error); else reset(); }
    catch { setError("Não foi possível concluir a operação."); }
    finally { setPending(false); }
  }
  return <section className="space-y-4 rounded border bg-white p-5">
    <h2 className="text-lg font-semibold">Notificações do Controle Interno</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); const idempotencyKey = key || crypto.randomUUID(); setKey(idempotencyKey); void run(() => sendControlNoticeAction({ ...form, findingId: form.findingId || undefined, idempotencyKey }), () => { setKey(""); setForm({ planId: "", findingId: "", recipientId: "", title: "", message: "", dueAt: "", documentIds: [] }); }); }}>
      <h3 className="font-semibold md:col-span-2">Enviar documento / solicitar resposta</h3>
      <select required aria-label="Plano da notificação" className="rounded border p-2" value={form.planId} onChange={event => { setKey(""); setForm({ ...form, planId: event.target.value, findingId: "", recipientId: "" }); }}><option value="">Plano sob sua responsabilidade</option>{plans.filter(plan => plan.status === "ABERTO" && plan.ownerId === userId).map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select>
      <select required aria-label="Destinatário da notificação" className="rounded border p-2" value={form.recipientId} onChange={event => { setKey(""); setForm({ ...form, recipientId: event.target.value }); }}><option value="">Destinatário da UG</option>{recipients.filter(recipient => selectedPlan?.budgetUnitId && recipient.budgetUnitIds.includes(selectedPlan.budgetUnitId) && recipient.id !== userId).map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}</option>)}</select>
      <select aria-label="Apontamento relacionado" className="rounded border p-2" value={form.findingId} onChange={event => { setKey(""); setForm({ ...form, findingId: event.target.value }); }}><option value="">Documento / comunicação do plano</option>{selectedPlan?.findings.filter(finding => finding.status !== "RESOLVIDO").map(finding => <option key={finding.id} value={finding.id}>{finding.title}</option>)}</select>
      <input required aria-label="Prazo para resposta" type="date" className="rounded border p-2" value={form.dueAt} onChange={event => { setKey(""); setForm({ ...form, dueAt: event.target.value }); }} />
      <input required placeholder="Título" className="rounded border p-2" value={form.title} onChange={event => { setKey(""); setForm({ ...form, title: event.target.value }); }} />
      <select multiple aria-label="Anexos da notificação" className="rounded border p-2" value={form.documentIds} onChange={event => { setKey(""); setForm({ ...form, documentIds: [...event.target.selectedOptions].map(option => option.value) }); }}>{documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select>
      <textarea required placeholder="Mensagem / esclarecimentos solicitados" className="rounded border p-2 md:col-span-2" value={form.message} onChange={event => { setKey(""); setForm({ ...form, message: event.target.value }); }} />
      <button disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-white">Enviar notificação interna</button>
    </form>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} /> Exibir apenas pendentes</label>
    <h3 className="font-semibold">Minha caixa ({inbox.filter(notice => !notice.response).length} aguardando resposta)</h3>
    <div className="flex flex-wrap gap-3 text-sm">{inbox.map(notice => <a key={notice.id} className="underline" href={`/api/controle-interno/planos/${notice.planId}?noticeId=${notice.id}&format=PDF`}>Imprimir: {notice.title}</a>)}</div>
    <div className="space-y-2">{inbox.filter(notice => !pendingOnly || !notice.response).map(notice => <article key={notice.id} className="rounded border p-3 text-sm"><strong>{notice.title}</strong><p>Prazo: {notice.dueAt.slice(0, 10)} · {notice.response ? "Respondida" : "Aguardando resposta"} · {notice.documentIds.length} anexos GED</p><p className="whitespace-pre-wrap">{notice.message}</p>{notice.response && <p className="whitespace-pre-wrap">Resposta: {notice.response}</p>}{notice.review && <p>Análise: {notice.review.accepted ? "Aceita" : "Não aceita"} — {notice.review.reason}</p>}{!notice.response && <button className="mt-2 rounded border px-2 py-1" onClick={() => setAnswer({ noticeId: notice.id, response: "", documentIds: [] })}>Responder</button>}</article>)}</div>
    {answer.noticeId && <form className="grid gap-2 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(() => respondControlNoticeAction(answer), () => setAnswer({ noticeId: "", response: "", documentIds: [] })); }}><h3 className="font-semibold">Resposta à notificação</h3><textarea required className="rounded border p-2" aria-label="Resposta do notificado" value={answer.response} onChange={event => setAnswer({ ...answer, response: event.target.value })} /><select multiple aria-label="Evidências da resposta" className="rounded border p-2" value={answer.documentIds} onChange={event => setAnswer({ ...answer, documentIds: [...event.target.selectedOptions].map(option => option.value) })}>{documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select><button disabled={pending} className="rounded bg-emerald-700 p-2 text-white">Registrar resposta</button></form>}
    <h3 className="font-semibold">Notificações enviadas / análise</h3>
    <div className="flex flex-wrap gap-3 text-sm">{sent.map(notice => <a key={notice.id} className="underline" href={`/api/controle-interno/planos/${notice.planId}?noticeId=${notice.id}&format=PDF`}>Imprimir com respostas: {notice.title}</a>)}</div>
    <div className="space-y-2">{sent.filter(notice => !pendingOnly || !notice.review).map(notice => <article key={notice.id} className="rounded border p-3 text-sm"><strong>{notice.title}</strong><p>{notice.recipientName} · prazo {notice.dueAt.slice(0, 10)} · {notice.review ? "Analisada" : notice.response ? "Aguardando análise" : "Aguardando resposta"}</p><p className="whitespace-pre-wrap">{notice.message}</p>{notice.response && <p className="whitespace-pre-wrap">Resposta: {notice.response}</p>}{notice.review && <p>Análise: {notice.review.reason}</p>}{notice.response && !notice.review && notice.recipientId !== userId && <button className="mt-2 rounded border px-2 py-1" onClick={() => setReview({ noticeId: notice.id, accepted: true, reason: "" })}>Analisar resposta</button>}</article>)}</div>
    {review.noticeId && <form className="grid gap-2 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(() => reviewControlNoticeResponseAction(review), () => setReview({ noticeId: "", accepted: true, reason: "" })); }}><h3 className="font-semibold">Análise pelo controlador</h3><select aria-label="Decisão sobre a resposta" className="rounded border p-2" value={String(review.accepted)} onChange={event => setReview({ ...review, accepted: event.target.value === "true" })}><option value="true">Aceitar resposta</option><option value="false">Não aceitar resposta</option></select><textarea required aria-label="Fundamentação da análise" className="rounded border p-2" value={review.reason} onChange={event => setReview({ ...review, reason: event.target.value })} /><button disabled={pending} className="rounded bg-emerald-700 p-2 text-white">Registrar análise</button></form>}
  </section>;
}
