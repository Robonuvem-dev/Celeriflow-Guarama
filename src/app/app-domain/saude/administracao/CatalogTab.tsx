"use client";

import { useState } from "react";
import { Pencil, Power } from "lucide-react";
import type { CboRow, ServiceRow, SpecialtyRow } from "./AdministracaoClient";
import { saveHealthCbo, saveHealthService, saveHealthSpecialty } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../operational-columns";
import { HealthFeedback } from "../HealthPageTools";

type Kind = "especialidades" | "servicos" | "cbo";
type Props = { kind: Kind; rows: SpecialtyRow[] | ServiceRow[] | CboRow[]; editor: { kind: string; id?: string } | null; canUpdate: boolean; onEdit: (id: string) => void; onClose: () => void };

const labels: Record<Kind, { singular: string; description: string }> = {
  especialidades: { singular: "Especialidade", description: "Descrição" },
  servicos: { singular: "Serviço SUS", description: "Descrição" },
  cbo: { singular: "CBO", description: "Ocupação" },
};

function normalize(kind: Kind, row: SpecialtyRow | ServiceRow | CboRow) {
  return { id: row.id, code: row.code, name: "description" in row ? row.description : row.name, classification: "classification" in row ? row.classification : null, isActive: row.isActive };
}

export default function CatalogTab({ kind, rows, editor, canUpdate, onEdit, onClose }: Props) {
  const normalized = rows.map(row => normalize(kind, row));
  const editing = editor?.kind === kind ? normalized.find(row => row.id === editor.id) : undefined;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(id: string | null, data: { code: string; name: string; classification: string; isActive: boolean }) {
    if (kind === "especialidades") return saveHealthSpecialty(id, data);
    if (kind === "servicos") return saveHealthService(id, data);
    return saveHealthCbo(id, data);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const values = new FormData(event.currentTarget);
    const result = await save(editing?.id || null, { code: String(values.get("code") || ""), name: String(values.get("name") || ""), classification: String(values.get("classification") || ""), isActive: editing?.isActive ?? true });
    setSaving(false);
    if ("error" in result) setError(result.error); else onClose();
  }

  async function toggle(row: ReturnType<typeof normalize>) {
    setError("");
    const result = await save(row.id, { code: row.code, name: row.name, classification: row.classification || "", isActive: !row.isActive });
    if ("error" in result) setError(result.error);
  }

  return <>
    {!editor && <HealthFeedback message={error} error />}
    <OperationalTable preferenceId={`saude-admin-${kind}`} caption={labels[kind].singular} columns={[healthColumn("code", "Código", 130, 90, "identifier"), healthColumn("name", labels[kind].description, 330, 140), ...(kind === "servicos" ? [healthColumn("classification", "Classificação", 220, 120)] : []), healthColumn("status", "Situação", 110, 80, "status"), healthColumn("actions", "Ações", 64, 64, "actions", "right", 80)]} rows={normalized.map(row => ({ id: row.id, label: row.name, values: { code: row.code, name: row.name, classification: row.classification || "—", status: row.isActive ? "Ativo" : "Inativo" }, actions: canUpdate && <div className="flex justify-end gap-1"><button aria-label={`Editar ${row.name}`} onClick={() => onEdit(row.id)}><Pencil className="size-4" /></button><button aria-label={`${row.isActive ? "Inativar" : "Ativar"} ${row.name}`} onClick={() => toggle(row)}><Power className="size-4" /></button></div> }))} />

    {editor?.kind === kind && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="w-full max-w-md rounded-md bg-white shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700"><h2 className="text-sm font-bold">{editing ? "Editar" : "Novo"} {labels[kind].singular}</h2><button type="button" className="text-xs text-slate-500" onClick={onClose}>Fechar</button></div><div className="space-y-3 p-4 text-xs">{error && <p className="rounded bg-rose-50 p-2 text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}<label className="block font-semibold">Código<input required name="code" defaultValue={editing?.code || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label><label className="block font-semibold">{labels[kind].description}<input required name="name" defaultValue={editing?.name || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label>{kind === "servicos" && <label className="block font-semibold">Classificação<input name="classification" defaultValue={editing?.classification || ""} className="mt-1 h-8 w-full rounded border px-2 font-normal dark:border-slate-600 dark:bg-slate-950" /></label>}</div><div className="flex justify-end gap-2 border-t px-4 py-3 dark:border-slate-700"><button type="button" onClick={onClose} className="h-8 rounded border px-3 text-xs">Cancelar</button><button disabled={saving} className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button></div></form></div>}
  </>;
}
