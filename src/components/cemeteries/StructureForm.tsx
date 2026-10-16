"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { structureConfig, type StructureKind } from "@/lib/cemeteries/structure-config";
import { saveStructureAction } from "@/app/app-domain/cemiterios/estrutura/actions";

function Lookup({ name, kind, value, required, cemeteryId }: { name: string; kind: string; value: string; required?: boolean; cemeteryId?: string }) {
  const [selected, setSelected] = useState(value);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = new URLSearchParams({ kind, q: query, page: String(page), ...(cemeteryId ? { cemeteryId } : {}) });
        const response = await fetch(`/api/cemiterios/referencias?${url}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível pesquisar referências.");
        const body = await response.json();
        const rows = body.items ?? body.rows ?? body.results ?? [];
        setOptions(rows.map((r: { id: string; label?: string; name?: string; identifier?: string; code?: string }) => ({ id: r.id, label: r.label ?? r.name ?? r.identifier ?? r.code ?? r.id })));
        setMore(body.hasMore ?? (body.total > page * 20)); setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erro na pesquisa."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, query, page, cemeteryId]);
  return <div className="space-y-2"><input aria-label={`Pesquisar ${name}`} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Pesquisar por nome, código ou documento" className="w-full rounded border p-2" /><select name={name} required={required} value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded border p-2"><option value="">Selecione</option>{selected && !options.some(o => o.id === selected) && <option value={selected}>Vínculo atual: {selected}</option>}{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select><div className="flex gap-2 text-xs"><button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!more} onClick={() => setPage(p => p + 1)}>Próxima</button></div>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}

export function StructureForm({ kind, record, fields, returnHref }: { kind: StructureKind; record: Record<string, unknown>; fields: { fieldKey: string; label: string; valueType: string; required: boolean; active: boolean; cemeteryId: string }[]; returnHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [cemeteryId, setCemeteryId] = useState(String(record.cemeteryId ?? ""));
  const extra = (record.additionalData ?? {}) as Record<string, unknown>;
  return <form className="space-y-5" onChange={e => { const target = e.target; if (target instanceof HTMLSelectElement && target.name === "cemeteryId") setCemeteryId(target.value); }} onSubmit={e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    for (const field of structureConfig[kind].fields) data[field.key] = field.type === "checkbox" ? fd.has(field.key) : fd.get(field.key) ?? "";
    data.additionalData = Object.fromEntries(fields.filter(f => f.cemeteryId === cemeteryId && f.active).map(f => [f.fieldKey, fd.get(`extra.${f.fieldKey}`)]));
    data.expectedUpdatedAt = record.updatedAt;
    start(async () => { const result = await saveStructureAction(kind, record.id ? String(record.id) : undefined, data); if (result.error) setError(result.error); else { setError(""); router.push(returnHref); router.refresh(); } });
  }}>
    <div className="grid gap-4 md:grid-cols-2">{structureConfig[kind].fields.map(field => <label key={field.key} className="space-y-1 text-sm"><span className="block font-medium">{field.label}{field.required && " *"}</span>{field.lookup ? <Lookup name={field.key} kind={field.lookup} value={String(record[field.key] ?? "")} required={field.required} cemeteryId={field.lookup === "lot" ? cemeteryId : undefined} /> : field.options ? <select name={field.key} defaultValue={String(record[field.key] ?? field.options[0])} className="w-full rounded border p-2">{field.options.map(o => <option key={o}>{o}</option>)}</select> : field.type === "checkbox" ? <input type="checkbox" name={field.key} defaultChecked={record[field.key] === undefined ? field.key === "active" : Boolean(record[field.key])} /> : field.type === "textarea" ? <textarea name={field.key} defaultValue={String(record[field.key] ?? "")} className="w-full rounded border p-2" /> : <input name={field.key} type={field.type ?? "text"} required={field.required} defaultValue={String(record[field.key] ?? (field.type === "number" ? field.key === "sortOrder" ? 0 : 1 : ""))} className="w-full rounded border p-2" />}</label>)}</div>
    {fields.filter(f => f.cemeteryId === cemeteryId).map(f => <label key={f.fieldKey} className="block space-y-1 text-sm"><span>{f.label}{!f.active && " (inativo — valor preservado)"}{f.required && f.active && " *"}</span><input name={`extra.${f.fieldKey}`} type={f.valueType === "NUMERICO" ? "number" : "text"} step="any" disabled={!f.active} required={f.active && f.required} defaultValue={String(extra[f.fieldKey] ?? "")} className="block w-full rounded border p-2" /></label>)}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Salvando…" : "Salvar cadastro"}</button>
  </form>;
}
