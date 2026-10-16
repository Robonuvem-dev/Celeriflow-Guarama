"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

export type SearchReferenceRecord = { id: string; label: string; detail?: string; departmentId?: string; departmentName?: string; unitOfMeasure?: string; quantity?: number };

export function SearchReferenceField({ label, kind, value, selectedLabel, filters = {}, children, onSelect }: {
  label: string; kind: string; value: string; selectedLabel: string; filters?: Record<string, string>; children?: ReactNode;
  onSelect: (record: SearchReferenceRecord | null) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ records: SearchReferenceRecord[]; total: number }>({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const filterQuery = new URLSearchParams(filters).toString();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/patrimonio/requisicoes/referencias?${new URLSearchParams({ kind, q: search, page: String(page) })}&${filterQuery}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha na pesquisa.");
        setResult(body);
      } catch (error) {
        if (!controller.signal.aborted) { setResult({ records: [], total: 0 }); setError(error instanceof Error ? error.message : "Falha na pesquisa."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, search, page, filterQuery]);

  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block text-xs font-semibold text-slate-700">{label}</label>
    {value ? <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs"><span className="min-w-0 font-medium text-emerald-900">{selectedLabel}</span><button type="button" onClick={() => { onSelect(null); setPage(1); }} className="shrink-0 text-emerald-800 underline">Alterar</button></div> : <>
      <input id={id} type="search" autoComplete="off" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={kind === "materials" ? "Pesquisar código, nome ou descrição" : "Pesquisar nome ou matrícula"} className="h-8 w-full rounded border border-slate-300 bg-white px-3 text-xs" />
      {children}
      <div aria-label={`Resultados de ${label.toLowerCase()}`} aria-busy={loading} className="max-h-44 overflow-y-auto rounded border bg-white">
        {loading ? <p role="status" className="p-3 text-xs text-slate-500">Pesquisando...</p> : error ? <p role="alert" className="p-3 text-xs text-red-700">{error}</p> : !result.records.length ? <p className="p-3 text-xs text-slate-500">Nenhum registro encontrado. Ajuste a pesquisa ou os filtros.</p> : result.records.map(record => <button key={record.id} type="button" onClick={() => onSelect(record)} className="block w-full border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-emerald-50 focus-visible:bg-emerald-50"><span className="block font-semibold text-slate-800">{record.label}</span>{record.detail && <span className="block text-[11px] text-slate-500">{record.detail}</span>}</button>)}
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{result.total} resultados · página {page}</span><div className="flex gap-3"><button type="button" disabled={loading || page === 1} onClick={() => setPage(current => current - 1)} className="disabled:opacity-40">Anterior</button><button type="button" disabled={loading || page * 20 >= result.total} onClick={() => setPage(current => current + 1)} className="disabled:opacity-40">Próxima</button></div></div>
    </>}
  </div>;
}
