"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transportAnnualExtraNotes, undoAnnualExtraNotes } from "../actions";

type Year = { id: string; year: number; status: string; governmentEntityId: string; entityName: string };
type Stage = { id: string; year: number; reason: string; total: string; undone: boolean; notes: { id: string; title: string; value: string; sourceId: string; resourceSourceId: string; budgetUnitId: string }[] };
export default function ExtraNoteTransportClient({ years, stages }: { years: Year[]; stages: Stage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ sourceFinancialYearId: "", targetFinancialYearId: "", reason: "", requestKey: "" });
  const source = years.find(year => year.id === form.sourceFinancialYearId);
  return <section className="m-3 space-y-3 rounded border bg-white p-4"><h2 className="font-bold">Transporte de notas extraorçamentárias</h2><p className="text-sm text-slate-600">Copia para o exercício seguinte as notas de retenções e créditos extraorçamentários a pagar, com documento, fonte, UG e vínculo à obrigação original. O recolhimento ou a restituição continua na rotina canônica, sem criar outra dívida ou saída de caixa.</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    const key = form.requestKey || crypto.randomUUID();
    setForm(current => ({ ...current, requestKey: key }));
    const result = await transportAnnualExtraNotes({ ...form, requestKey: key });
    setNotice(result.error ?? `Notas transportadas na edição ${result.stageId}${result.replay ? " (já registrada)" : ""}.`);
    if (!result.error) { setForm(current => ({ ...current, requestKey: "" })); router.refresh(); }
  }); }}><fieldset disabled={pending} className="contents"><label className="grid gap-1 text-sm">Origem encerrada<select required className="rounded border p-2" value={form.sourceFinancialYearId} onChange={event => setForm({ ...form, sourceFinancialYearId: event.target.value, targetFinancialYearId: "", requestKey: "" })}><option value="">Selecione</option>{years.filter(year => year.status === "Encerrado").map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year}</option>)}</select></label><label className="grid gap-1 text-sm">Destino aberto<select required className="rounded border p-2" value={form.targetFinancialYearId} onChange={event => setForm({ ...form, targetFinancialYearId: event.target.value, requestKey: "" })}><option value="">Selecione</option>{years.filter(year => source && year.governmentEntityId === source.governmentEntityId && year.year === source.year + 1 && year.status === "Aberto").map(year => <option key={year.id} value={year.id}>{year.year}</option>)}</select></label><label className="grid gap-1 text-sm sm:col-span-2">Justificativa<input required className="rounded border p-2" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value, requestKey: "" })} /></label><button className="w-fit rounded border px-3 py-2 font-semibold">Transportar notas a pagar</button></fieldset></form>{notice && <p role="status" className="rounded bg-amber-50 p-3 text-sm">{notice}</p>}
    <form className="grid gap-3 border-t pt-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => {
      const result = await undoAnnualExtraNotes({ stageId: String(data.get("stageId")), reason: String(data.get("reason")) });
      setNotice(result.error ?? "Transporte extraorçamentário desmovimentado, com documentos preservados.");
      if (!result.error) router.refresh();
    }); }}><fieldset disabled={pending} className="contents"><label className="grid gap-1 text-sm">Edição para desmovimentar<select required name="stageId" className="rounded border p-2"><option value="">Selecione</option>{stages.filter(stage => !stage.undone).map(stage => <option key={stage.id} value={stage.id}>{stage.year} · {stage.id}</option>)}</select></label><label className="grid gap-1 text-sm">Justificativa<input required name="reason" className="rounded border p-2" /></label><button className="w-fit rounded border border-amber-700 px-3 py-2 text-sm">Desmovimentar notas separadamente</button></fieldset></form>
    <div className="space-y-2">{stages.map(stage => <details key={stage.id} className="rounded border p-3 text-sm"><summary>{stage.year} · R$ {stage.total} · {stage.undone ? "Desmovimentada" : "Transportada"} · {stage.id}</summary><p>{stage.reason}</p><table className="mt-2 w-full text-left"><thead><tr><th>Nota no destino</th><th>Obrigação canônica</th><th>UG / fonte</th><th>Valor transportado</th></tr></thead><tbody>{stage.notes.map(note => <tr key={note.id}><td>{note.title} · {note.id}</td><td>{note.sourceId}</td><td>{note.budgetUnitId} / {note.resourceSourceId}</td><td>R$ {note.value}</td></tr>)}</tbody></table></details>)}</div><a href="/financeiro/pagamentos" className="text-sm font-semibold text-emerald-800 underline">Recolher retenções na obrigação original</a>
  </section>;
}
