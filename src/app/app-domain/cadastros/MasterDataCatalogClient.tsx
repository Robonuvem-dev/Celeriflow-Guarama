"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { mutateMasterDataRecord, setMasterDataRecordActive } from "./master-data-actions";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataRow, MasterDataValue } from "./master-data-types";

type Props = {
  catalog: MasterDataCatalog;
  pathname: string;
  rows: MasterDataRow[];
  columns: MasterDataColumn[];
  fields: MasterDataField[];
  page: number;
  total: number;
  query: string;
  extraQuery?: Record<string, string>;
  statusMutable?: boolean;
};

function href(pathname: string, page: number, query: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  if (query) params.set("q", query);
  params.set("page", String(page));
  return `${pathname}?${params}`;
}

function display(value: MasterDataValue | undefined) {
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return value || "-";
}

export function MasterDataCatalogClient({ catalog, pathname, rows, columns, fields, page, total, query, extraQuery, statusMutable = true }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterDataRow | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setEditing(null);
    setError("");
  }

  function submit(formData: FormData) {
    const values: Record<string, MasterDataValue> = {};
    for (const field of fields) {
      if (field.type === "checkbox") values[field.name] = formData.get(field.name) === "on";
      else if (field.type === "multiselect") values[field.name] = formData.getAll(field.name).map(String);
      else values[field.name] = String(formData.get(field.name) || "").trim();
    }
    startTransition(async () => {
      const result = await mutateMasterDataRecord(catalog, editing?.id || null, values);
      if (result.error) return setError(result.error);
      close();
      router.refresh();
    });
  }

  function toggle(row: MasterDataRow) {
    setError("");
    startTransition(async () => {
      const result = await setMasterDataRecordActive(catalog, row.id, !row.active);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <>
      {error && !open && <p role="alert" className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <ErpListFrame
        toolbar={<div className="flex gap-2"><form action={pathname} className="flex flex-1 gap-2">{Object.entries(extraQuery || {}).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<input name="q" type="search" defaultValue={query} placeholder="Buscar registros" aria-label="Buscar registros" className="h-7 w-full max-w-md rounded border border-slate-300 px-2.5 text-xs outline-none focus:border-emerald-600" /><button className="h-7 rounded border border-slate-300 px-3 text-xs font-medium">Buscar</button></form><button type="button" onClick={() => { setError(""); setEditing(null); setOpen(true); }} className="inline-flex h-7 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white"><Plus className="size-3.5" />Adicionar</button></div>}
        pagination={<ErpPagination page={page} total={total} previousHref={href(pathname, page - 1, query, extraQuery)} nextHref={href(pathname, page + 1, query, extraQuery)} label="registros" jumpTo={{ pathname, values: { q: query, ...extraQuery } }} />}
      >
        <table className="w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-600"><tr>{columns.map(column => <th key={column.key} className="h-8 px-3">{column.label}</th>)}<th className="h-8 w-28 px-3">Status</th><th className="h-8 w-24 px-3 text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} className="hover:bg-slate-50">{columns.map(column => <td key={column.key} className="max-w-0 truncate px-3 py-1.5 text-slate-700" title={String(display(row.values[column.key]))}>{display(row.values[column.key])}</td>)}<td className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${row.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.active ? "Ativo" : "Inativo"}</span></td><td className="px-3 py-1.5"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => { setError(""); setEditing(row); setOpen(true); }} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil className="size-3.5" /></button>{statusMutable && <button type="button" title={row.active ? "Inativar" : "Reativar"} onClick={() => toggle(row)} disabled={pending} className="rounded p-1 text-slate-500 hover:bg-slate-100"><RefreshCw className="size-3.5" /></button>}</div></td></tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-xs text-slate-500">Nenhum registro encontrado.</p>}
      </ErpListFrame>
      {open && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="master-data-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><h2 id="master-data-dialog-title" className="text-sm font-bold text-slate-800">{editing ? "Editar registro" : "Novo registro"}</h2><button type="button" onClick={close} aria-label="Fechar"><X className="size-4" /></button></div><form action={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">{fields.map(field => <label key={field.name} className={field.type === "textarea" || field.type === "multiselect" ? "sm:col-span-2" : ""}><span className="mb-1 block text-[11px] font-semibold text-slate-600">{field.label}{field.required ? " *" : ""}</span>{field.type === "textarea" ? <textarea name={field.name} required={field.required} defaultValue={String(editing?.values[field.name] || "")} className="min-h-20 w-full rounded border border-slate-300 px-2 py-1.5 text-xs" /> : field.type === "select" ? <select name={field.name} required={field.required} defaultValue={String(editing?.values[field.name] || "")} className="h-8 w-full rounded border border-slate-300 px-2 text-xs"><option value="">Selecione</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "multiselect" ? <select multiple name={field.name} defaultValue={Array.isArray(editing?.values[field.name]) ? editing.values[field.name] as string[] : []} className="min-h-28 w-full rounded border border-slate-300 px-2 py-1 text-xs">{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "checkbox" ? <input name={field.name} type="checkbox" defaultChecked={Boolean(editing?.values[field.name])} className="size-4" /> : <input name={field.name} type={field.type || "text"} required={field.required} defaultValue={String(editing?.values[field.name] || "")} placeholder={field.placeholder} className="h-8 w-full rounded border border-slate-300 px-2 text-xs" />}</label>)}{error && <p role="alert" className="sm:col-span-2 text-xs font-medium text-red-700">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button type="button" onClick={close} className="h-8 rounded border border-slate-300 px-3 text-xs font-medium">Cancelar</button><button type="submit" disabled={pending} className="h-8 rounded bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-60">{pending ? "Salvando..." : "Salvar"}</button></div></form></div></div>}
    </>
  );
}
