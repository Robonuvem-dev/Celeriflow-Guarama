"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { authorizeTreatmentReportsAction } from "./actions";

type Range = { id: string; name: string; nextNumber: string | null; available: string };
function Submit() { const { pending } = useFormStatus(); return <button disabled={pending} className="rounded bg-teal-700 p-2 text-white">{pending ? "Autorizando…" : "Autorizar laudo(s) selecionado(s)"}</button>; }
export function AuthorizationForm({ ranges, reportId, formId = "bulk-authorization" }: { ranges: Range[]; reportId?: string; formId?: string }) {
  const [rangeId, setRangeId] = useState(ranges[0]?.id || ""), range = ranges.find(item => item.id === rangeId);
  return <form id={formId} action={authorizeTreatmentReportsAction} className="space-y-2 rounded border bg-white p-3 text-sm"><h2 className="font-semibold">Autorização {reportId ? "individual" : "coletiva"}</h2>{reportId && <input type="hidden" name="reportId" value={reportId}/>}<label className="block">Faixa numérica<select name="rangeId" required value={rangeId} onChange={event => setRangeId(event.target.value)} className="w-full rounded border p-2"><option value="">Selecione uma faixa vigente</option>{ranges.map(item => <option key={item.id} value={item.id}>{item.name} · saldo {item.available}</option>)}</select></label><p>Próxima numeração disponível: <strong>{range?.nextNumber || "Sem saldo"}</strong></p><input type="hidden" name="expectedNextNumber" value={range?.nextNumber || ""}/><Submit/></form>;
}
