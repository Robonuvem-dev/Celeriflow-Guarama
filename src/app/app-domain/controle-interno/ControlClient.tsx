"use client";

import { useState } from "react";
import { createControlFindingAction, createControlPlanAction, resolveControlFindingAction, transitionControlPlanAction, recordControlOpinionAction } from "./actions";

type Plan = { id: string; title: string; reference: string; status: string; dueAt: Date | null; budgetUnit?: { name: string } | null; findings: Array<{ id: string; title: string; status: string; dueAt: Date | null; responsibleId: string | null; evidenceDocumentId: string | null }>; events: Array<{ id: string; eventType: string; actorId: string; reason: string; createdAt: Date; snapshot: unknown }> };
type Option = { id: string; name: string };
const eventLabels: Record<string, string> = { PLAN_CREATED: "Plano criado", FINDING_CREATED: "Apontamento registrado", FINDING_RESOLVED: "Apontamento resolvido", PLAN_COMPLETED: "Plano concluído", PLAN_REOPENED: "Plano reaberto", CONTROL_OPINION: "Parecer do controle", CHECKLIST_PUBLISHED: "Checklist publicado", CHECKLIST_ANSWERED: "Item avaliado", CONTROL_NOTICE_SENT: "Notificação interna enviada", CONTROL_NOTICE_RESPONDED: "Resposta do notificado", CONTROL_NOTICE_REVIEWED: "Resposta analisada" };
function correctiveAction(snapshot: unknown) { return snapshot && typeof snapshot === "object" && "correctiveAction" in snapshot && typeof snapshot.correctiveAction === "string" ? snapshot.correctiveAction : null; }
function response(snapshot: unknown) { return snapshot && typeof snapshot === "object" && "response" in snapshot && typeof snapshot.response === "string" ? snapshot.response : null; }

export function ControlClient({ plans, employees, documents, budgetUnits }: { plans: Plan[]; employees: Option[]; documents: { id: string; title: string }[]; budgetUnits: Option[] }) {
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState({ title: "", reference: "", dueAt: "", budgetUnitId: "" });
  const [finding, setFinding] = useState({ planId: "", title: "", description: "", responsibleId: "", evidenceDocumentId: "", dueAt: "" });
  const [opinion, setOpinion] = useState({ findingId: "", opinion: "", correctiveAction: "", recruitment: false, employeeId: "" });
  const run = async (action: () => Promise<{ error?: string }>) => {
    setPending(true);
    try { const result = await action(); if (result.error) alert(result.error); }
    finally { setPending(false); }
  };
  return <div className="space-y-6 p-8">
    <div><h1 className="text-3xl font-bold">Controle Interno</h1><p className="mt-1 text-sm text-muted-foreground">Planos por entidade e UG, apontamentos, responsáveis, evidências GED e resolução auditável.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await createControlPlanAction(plan); if (!result.error) setPlan({ title: "", reference: "", dueAt: "", budgetUnitId: "" }); return result; }); }} className="grid gap-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Novo plano</h2>
        <select required aria-label="Entidade e unidade gestora" className="rounded border p-2" value={plan.budgetUnitId} onChange={(event) => setPlan({ ...plan, budgetUnitId: event.target.value })}><option value="">Entidade / unidade gestora</option>{budgetUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
        <input required className="rounded border p-2" placeholder="Título" value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} />
        <input required className="rounded border p-2" placeholder="Referência normativa ou processo" value={plan.reference} onChange={(event) => setPlan({ ...plan, reference: event.target.value })} />
        <input className="rounded border p-2" type="date" value={plan.dueAt} onChange={(event) => setPlan({ ...plan, dueAt: event.target.value })} />
        <button disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Criar plano</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await createControlFindingAction(finding); if (!result.error) setFinding({ planId: "", title: "", description: "", responsibleId: "", evidenceDocumentId: "", dueAt: "" }); return result; }); }} className="grid gap-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Novo apontamento</h2>
        <select required className="rounded border p-2" value={finding.planId} onChange={(event) => setFinding({ ...finding, planId: event.target.value })}><option value="">Plano aberto</option>{plans.filter((item) => item.status === "ABERTO").map((item) => <option key={item.id} value={item.id}>{item.budgetUnit?.name ?? "Legado"} — {item.title}</option>)}</select>
        <input required className="rounded border p-2" placeholder="Título" value={finding.title} onChange={(event) => setFinding({ ...finding, title: event.target.value })} />
        <textarea required className="rounded border p-2" placeholder="Descrição" value={finding.description} onChange={(event) => setFinding({ ...finding, description: event.target.value })} />
        <select className="rounded border p-2" value={finding.responsibleId} onChange={(event) => setFinding({ ...finding, responsibleId: event.target.value })}><option value="">Sem responsável</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="rounded border p-2" value={finding.evidenceDocumentId} onChange={(event) => setFinding({ ...finding, evidenceDocumentId: event.target.value })}><option value="">Sem evidência GED</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <input className="rounded border p-2" type="date" value={finding.dueAt} onChange={(event) => setFinding({ ...finding, dueAt: event.target.value })} />
        <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Registrar apontamento</button>
      </form>
    </div>
    <form className="grid gap-3 rounded-lg border bg-white p-5" onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await recordControlOpinionAction(opinion); if (!result.error) setOpinion({ findingId: "", opinion: "", correctiveAction: "", recruitment: false, employeeId: "" }); return result; }); }}>
      <h2 className="font-semibold">Parecer e providência corretiva</h2>
      <select required className="rounded border p-2" value={opinion.findingId} onChange={(event) => setOpinion({ ...opinion, findingId: event.target.value })}><option value="">Selecione o apontamento</option>{plans.filter(plan => plan.status === "ABERTO").flatMap(plan => plan.findings.filter(finding => finding.status !== "RESOLVIDO").map(finding => <option key={finding.id} value={finding.id}>{plan.title} — {finding.title}</option>))}</select>
      <textarea required className="rounded border p-2" placeholder="Parecer do controle interno" value={opinion.opinion} onChange={(event) => setOpinion({ ...opinion, opinion: event.target.value })} />
      <textarea required className="rounded border p-2" placeholder="Providência para sanar a irregularidade" value={opinion.correctiveAction} onChange={(event) => setOpinion({ ...opinion, correctiveAction: event.target.value })} />
      <label className="text-sm"><input type="checkbox" checked={opinion.recruitment} onChange={(event) => setOpinion({ ...opinion, recruitment: event.target.checked, employeeId: "" })} /> Parecer relativo a contratação de servidor</label>
      {opinion.recruitment && <select required className="rounded border p-2" value={opinion.employeeId} onChange={(event) => setOpinion({ ...opinion, employeeId: event.target.value })}><option value="">Identifique o servidor</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Registrar parecer</button>
    </form>
    <section className="space-y-3">{plans.map((item) => <article key={item.id} className="rounded-lg border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{item.title}</h2><p className="text-sm text-muted-foreground">{item.budgetUnit?.name ?? "Legado sem UG conciliada"} — {item.reference}</p></div><span className="text-sm font-medium">{item.status}</span></div>
      <div className="mt-2 flex gap-3 text-sm">{["PDF", "CSV", "XLSX"].map(format => <a key={format} className="underline" href={`/api/controle-interno/planos/${item.id}?format=${format}`}>Histórico {format}</a>)}</div>
      <div className="mt-4 space-y-2">{item.findings.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"><span>{entry.title}</span><span>{entry.status}{entry.evidenceDocumentId ? " · GED vinculado" : ""}</span>{item.status === "ABERTO" && entry.status !== "RESOLVIDO" && <button disabled={pending} onClick={() => { const reason = window.prompt("Justificativa da resolução do apontamento:"); if (reason?.trim()) void run(() => resolveControlFindingAction(entry.id, reason)); }} className="rounded border px-2 py-1 font-semibold">Resolver</button>}</div>)}{!item.findings.length && <p className="text-sm text-muted-foreground">Sem apontamentos.</p>}</div>
      {["ABERTO", "CONCLUIDO"].includes(item.status) && <button disabled={pending} className="mt-3 rounded border px-3 py-2 text-sm font-semibold" onClick={() => { const reason = window.prompt("Justificativa da decisão sobre o plano:"); if (reason?.trim()) void run(() => transitionControlPlanAction({ planId: item.id, status: item.status === "ABERTO" ? "CONCLUIDO" : "ABERTO", reason })); }}>{item.status === "ABERTO" ? "Concluir plano" : "Reabrir plano"}</button>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Histórico de decisões ({item.events.length})</summary><ul className="mt-2 space-y-2">{item.events.map((event) => <li key={event.id} className="rounded border p-2"><p>{eventLabels[event.eventType] ?? event.eventType} · {new Date(event.createdAt).toLocaleString("pt-BR")} · {event.actorId}</p><p className="whitespace-pre-wrap">{event.reason}</p>{response(event.snapshot) && <p>Resposta: {response(event.snapshot)}</p>}{correctiveAction(event.snapshot) && <p className="whitespace-pre-wrap">Providência: {correctiveAction(event.snapshot)}</p>}</li>)}</ul></details>
    </article>)}{!plans.length && <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum plano de controle registrado.</p>}</section>
  </div>;
}
