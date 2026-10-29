"use client";

import { useState } from "react";
import { Pencil, Power } from "lucide-react";
import type { GroupRow } from "./AdministracaoClient";
import { saveHealthSpecialtyGroup } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../operational-columns";
import { HealthFeedback } from "../HealthPageTools";

type Props = {
  rows: GroupRow[];
  editor: { kind: string; id?: string } | null;
  specialties: { id: string; code: string; name: string }[];
  services: { id: string; code: string; name: string }[];
  canUpdate: boolean;
  onEdit: (id: string) => void;
  onClose: () => void;
};

export default function GroupsTab({ rows, editor, specialties, services, canUpdate, onEdit, onClose }: Props) {
  const editing = editor?.kind === "grupos" ? rows.find(row => row.id === editor.id) : undefined;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const values = new FormData(event.currentTarget);
    const result = await saveHealthSpecialtyGroup(editing?.id || null, {
      name: String(values.get("name") || ""),
      isActive: editing?.isActive ?? true,
      specialtyIds: values.getAll("specialtyIds").map(String),
      serviceIds: values.getAll("serviceIds").map(String),
    });
    setSaving(false);
    if ("error" in result) setError(result.error); else onClose();
  }

  async function toggle(row: GroupRow) {
    const result = await saveHealthSpecialtyGroup(row.id, { name: row.name, isActive: !row.isActive, specialtyIds: row.specialties.map(item => item.specialty.id), serviceIds: row.services.map(item => item.service.id) });
    if ("error" in result) setError(result.error);
  }

  return <>
    {!editor && <HealthFeedback message={error} error />}
    <OperationalTable preferenceId="saude-admin-grupos" caption="Grupos de especialidades" columns={[healthColumn("name", "Grupo", 240, 120), healthColumn("specialties", "Especialidades", 280, 130), healthColumn("services", "Serviços", 260, 110), healthColumn("status", "Situação", 100, 80, "status"), healthColumn("actions", "Ações", 64, 64, "actions", "right", 80)]} rows={rows.map(row => ({ id: row.id, label: row.name, values: { name: row.name, specialties: row.specialties.map(item => item.specialty.name).join(", ") || "—", services: row.services.map(item => item.service.name).join(", ") || "—", status: row.isActive ? "Ativo" : "Inativo" }, actions: canUpdate && <div className="flex justify-end gap-1"><button aria-label={`Editar vínculos de ${row.name}`} onClick={() => onEdit(row.id)}><Pencil className="size-4" /></button><button aria-label={`${row.isActive ? "Inativar" : "Ativar"} ${row.name}`} onClick={() => toggle(row)}><Power className="size-4" /></button></div> }))} />

    {editor?.kind === "grupos" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={submit} className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700"><h2 className="text-sm font-bold">{editing ? "Editar Grupo de Especialidades" : "Novo Grupo de Especialidades"}</h2><button type="button" className="text-xs text-slate-500" onClick={onClose}>Fechar</button></div><div className="space-y-3 overflow-y-auto p-4 text-xs">{error && <p className="rounded bg-rose-50 p-2 text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}<label className="block font-semibold">Nome<input required name="name" defaultValue={editing?.name || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label><div className="grid gap-3 sm:grid-cols-2"><fieldset className="rounded border p-2 dark:border-slate-700"><legend className="px-1 font-bold">Especialidades</legend><div className="max-h-52 space-y-1 overflow-y-auto">{specialties.map(option => <label key={option.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"><input type="checkbox" name="specialtyIds" value={option.id} defaultChecked={editing?.specialties.some(item => item.specialty.id === option.id)} /><span className="truncate">{option.code} - {option.name}</span></label>)}</div></fieldset><fieldset className="rounded border p-2 dark:border-slate-700"><legend className="px-1 font-bold">Serviços</legend><div className="max-h-52 space-y-1 overflow-y-auto">{services.map(option => <label key={option.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"><input type="checkbox" name="serviceIds" value={option.id} defaultChecked={editing?.services.some(item => item.service.id === option.id)} /><span className="truncate">{option.code} - {option.name}</span></label>)}</div></fieldset></div></div><div className="flex justify-end gap-2 border-t px-4 py-3 dark:border-slate-700"><button type="button" onClick={onClose} className="h-8 rounded border px-3 text-xs">Cancelar</button><button disabled={saving} className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button></div></form></div>}
  </>;
}
