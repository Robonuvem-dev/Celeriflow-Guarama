"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateEquipmentCustodyAction } from "../actions";

export function EquipmentCustodyEditForm({ equipment }: { equipment: { id: string; code: string; name: string; serialNumber: string; status: string; department: string; responsible: string } }) {
  const [values, setValues] = useState({ name: equipment.name, serialNumber: equipment.serialNumber, status: equipment.status });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <section className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"><h1 className="text-base font-semibold">Editar equipamento · {equipment.code}</h1><p className="text-xs text-slate-600">Controle físico sem tombamento · {equipment.department} · {equipment.responsible}</p><form className="max-w-3xl space-y-3 rounded border bg-white p-4" onSubmit={event => { event.preventDefault(); setError(""); startTransition(async () => { try { const result = await updateEquipmentCustodyAction(equipment.id, values); if (result.error) setError(result.error); else router.push("/patrimonio/bens?tab=sem-tombamento"); } catch { setError("Não foi possível confirmar o salvamento."); } }); }}>
    <label className="grid gap-1 text-xs font-semibold">Descrição<input required value={values.name} onChange={event => setValues(current => ({ ...current, name: event.target.value }))} className="h-9 rounded border px-3 text-sm" /></label>
    <label className="grid gap-1 text-xs font-semibold">Número de série<input value={values.serialNumber} onChange={event => setValues(current => ({ ...current, serialNumber: event.target.value }))} className="h-9 rounded border px-3 text-sm" /></label>
    <label className="grid gap-1 text-xs font-semibold">Situação<select value={values.status} onChange={event => setValues(current => ({ ...current, status: event.target.value }))} className="h-9 rounded border bg-white px-3 text-sm"><option>Em uso</option><option>Ocioso</option><option>Em manutenção</option></select></label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}<div className="flex justify-end gap-3"><Link href="/patrimonio/bens?tab=sem-tombamento" className="text-xs underline">Cancelar</Link><button disabled={pending} className="rounded bg-blue-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar"}</button></div>
  </form></section>;
}
