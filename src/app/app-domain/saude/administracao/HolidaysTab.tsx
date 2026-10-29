"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { HolidayRow } from "./AdministracaoClient";
import { saveHealthHoliday } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../operational-columns";

type Props = { rows: HolidayRow[]; editor: { kind: string; id?: string } | null; canUpdate: boolean; onEdit: (id: string) => void; onClose: () => void };
const types = ["Nacional", "Estadual", "Municipal", "Ponto Facultativo", "Outros"] as const;

export default function HolidaysTab({ rows, editor, canUpdate, onEdit, onClose }: Props) {
  const editing = editor?.kind === "feriados" ? rows.find(row => row.id === editor.id) : undefined;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const values = new FormData(event.currentTarget);
    const result = await saveHealthHoliday(editing?.id || null, { title: String(values.get("title")), description: String(values.get("description") || ""), date: String(values.get("date")), type: String(values.get("type")) as typeof types[number] });
    setSaving(false); if ("error" in result) setError(result.error); else onClose();
  }
  return <>
    <OperationalTable preferenceId="saude-admin-feriados" caption="Feriados" columns={[healthColumn("date", "Data", 120, 92), healthColumn("title", "Feriado", 240, 120), healthColumn("type", "Tipo", 170, 100), healthColumn("description", "Descrição", 260, 120), healthColumn("actions", "Ações", 48, 48, "actions", "right", 64)]} rows={rows.map(row => ({ id: row.id, label: row.title, values: { date: new Date(row.date).toLocaleDateString("pt-BR", { timeZone: "UTC" }), title: row.title, type: row.type, description: row.description || "—" }, actions: canUpdate && <button aria-label={`Editar ${row.title}`} onClick={() => onEdit(row.id)}><Pencil className="size-4" /></button> }))} />
    {editor?.kind === "feriados" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-md bg-white shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700"><h2 className="text-sm font-bold">{editing ? "Editar Feriado" : "Novo Feriado"}</h2><button type="button" className="text-xs text-slate-500" onClick={onClose}>Fechar</button></div><div className="space-y-3 p-4 text-xs">{error && <p className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}<label className="block font-semibold">Nome<input required name="title" defaultValue={editing?.title || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label><div className="grid grid-cols-2 gap-2"><label className="font-semibold">Data<input required type="date" name="date" defaultValue={editing?.date.slice(0, 10) || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label><label className="font-semibold">Tipo<select required name="type" defaultValue={editing?.type || "Municipal"} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950">{types.map(type => <option key={type}>{type}</option>)}</select></label></div><label className="block font-semibold">Descrição<input name="description" defaultValue={editing?.description || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label></div><div className="flex justify-end gap-2 border-t px-4 py-3 dark:border-slate-700"><button type="button" onClick={onClose} className="h-8 rounded border px-3 text-xs">Cancelar</button><button disabled={saving} className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white">{saving ? "Salvando..." : "Salvar"}</button></div></form></div>}
  </>;
}
