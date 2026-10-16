"use client";

import { useState, useTransition } from "react";
import { saveItbiTypeAction } from "./actions";

export type ItbiTypeOption = { id: string; code: string; name: string; rate: number; damStage: string; updateMode: string; legalBasis: string | null; requiresDebtClearance: boolean; updatedAt: string };

export default function ItbiParameters({ types }: { types: ItbiTypeOption[] }) {
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = types.find(item => item.id === id);
  const field = "mt-1 w-full rounded border px-2 py-1.5 text-xs";
  return <section className="shrink-0 rounded border bg-white p-3"><h2 className="text-sm font-bold">Modalidades de transmissão</h2><select aria-label="Modalidade para editar" value={id} onChange={event => setId(event.target.value)} className={field}><option value="">Nova modalidade</option>{types.map(item => <option key={item.id} value={item.id}>{item.name} · {item.rate}%</option>)}</select>
    <form key={`${id}:${selected?.updatedAt ?? "new"}`} action={form => { startTransition(async () => { const result = await saveItbiTypeAction({ id: id || undefined, code: String(form.get("code")), name: String(form.get("name")), rate: String(form.get("rate")), requiresDebtClearance: form.get("clearance") === "on", legalBasis: String(form.get("basis")), expectedUpdatedAt: selected?.updatedAt ?? null }); setMessage(result.error ?? "Modalidade salva. Declarações anteriores conservam o cálculo e as regras originais."); }); }} className="mt-3 grid gap-2 sm:grid-cols-4">
      <label className="text-xs">Código<input name="code" required defaultValue={selected?.code} className={field} /></label><label className="text-xs sm:col-span-2">Nome<input name="name" required defaultValue={selected?.name} className={field} /></label><label className="text-xs">Alíquota (%)<input name="rate" type="number" min="0" max="100" step="0.000001" required defaultValue={selected?.rate} className={field} /></label>
      <label className="text-xs sm:col-span-3">Fundamento<textarea name="basis" required defaultValue={selected?.legalBasis ?? ""} className={field} /></label><label className="flex items-center gap-2 text-xs"><input name="clearance" type="checkbox" defaultChecked={selected?.requiresDebtClearance ?? true} />Exigir ausência de débitos do imóvel</label><button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Salvar modalidade</button>
    </form>{message && <p role="status" className="mt-2 text-xs text-amber-900">{message}</p>}
  </section>;
}
