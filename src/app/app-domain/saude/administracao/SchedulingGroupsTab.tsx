"use client";

import { useState } from "react";
import { Pencil, Power } from "lucide-react";
import type { SchedulingGroupRow } from "./AdministracaoClient";
import { saveHealthSchedulingGroup } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../operational-columns";
import { HealthFeedback } from "../HealthPageTools";

type Props = { rows: SchedulingGroupRow[]; editor: { kind: string; id?: string } | null; units: { id: string; name: string }[]; groups: { id: string; name: string }[]; canUpdate: boolean; onEdit: (id: string) => void; onClose: () => void };

export default function SchedulingGroupsTab({ rows, editor, units, groups, canUpdate, onEdit, onClose }: Props) {
  const editing = editor?.kind === "agendamentos" ? rows.find(row => row.id === editor.id) : undefined;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function persist(id: string | null, data: { name: string; unitId: string; specialtyGroupId: string; isActive: boolean }) {
    setSaving(true); setError("");
    const result = await saveHealthSchedulingGroup(id, data);
    setSaving(false);
    if ("error" in result) setError(result.error); else onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    await persist(editing?.id || null, { name: String(values.get("name")), unitId: String(values.get("unitId")), specialtyGroupId: String(values.get("specialtyGroupId")), isActive: editing?.isActive ?? true });
  }

  return <>
    {!editor && <HealthFeedback message={error} error />}
    <OperationalTable preferenceId="saude-admin-agendamentos" caption="Grupos de agendamento" columns={[healthColumn("name", "Grupo de agendamento", 260, 150), healthColumn("unit", "Unidade", 240, 110), healthColumn("group", "Grupo de especialidades", 260, 150), healthColumn("status", "Situação", 100, 80, "status"), healthColumn("actions", "Ações", 64, 64, "actions", "right", 80)]} rows={rows.map(row => ({ id: row.id, label: row.name, values: { name: row.name, unit: row.unit.name, group: row.specialtyGroup.name, status: row.isActive ? "Ativo" : "Inativo" }, actions: canUpdate && <div className="flex justify-end gap-1"><button aria-label={`Editar ${row.name}`} onClick={() => onEdit(row.id)}><Pencil className="size-4" /></button><button aria-label={`${row.isActive ? "Inativar" : "Ativar"} ${row.name}`} onClick={() => persist(row.id, { name: row.name, unitId: row.unit.id, specialtyGroupId: row.specialtyGroup.id, isActive: !row.isActive })}><Power className="size-4" /></button></div> }))} />
    {editor?.kind === "agendamentos" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-md bg-white shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700"><h2 className="text-sm font-bold">{editing ? "Editar" : "Novo"} Grupo de Agendamento</h2><button type="button" className="text-xs text-slate-500" onClick={onClose}>Fechar</button></div><div className="space-y-3 p-4 text-xs">{error && <p className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}<label className="block font-semibold">Nome<input required name="name" defaultValue={editing?.name || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label><label className="block font-semibold">Unidade<select required name="unitId" defaultValue={editing?.unit.id || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950"><option value="">Selecione</option>{units.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="block font-semibold">Grupo de especialidades<select required name="specialtyGroupId" defaultValue={editing?.specialtyGroup.id || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950"><option value="">Selecione</option>{groups.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label></div><div className="flex justify-end gap-2 border-t px-4 py-3 dark:border-slate-700"><button type="button" onClick={onClose} className="h-8 rounded border px-3 text-xs">Cancelar</button><button disabled={saving} className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white">Salvar</button></div></form></div>}
  </>;
}
