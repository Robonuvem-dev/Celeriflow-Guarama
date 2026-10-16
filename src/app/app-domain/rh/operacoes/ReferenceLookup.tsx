"use client";

import { useEffect, useState } from "react";

export function ReferenceLookup({ kind, name, initialValue = "", required, multiple = false }: { kind: string; name: string; initialValue?: string; required?: boolean; multiple?: boolean }) {
  const [value, setValue] = useState(initialValue);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [selectedLabel, setSelectedLabel] = useState(initialValue);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/rh/referencias?${new URLSearchParams({ kind, q, page: String(page) })}`, { signal: abort.signal });
        if (!response.ok) throw new Error("Falha ao consultar referências.");
        const data = await response.json();
        setItems(data.items); setTotal(data.total); setError("");
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Falha ao consultar."); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [kind, q, page]);
  return <div className="mt-1 space-y-1">
    <input aria-label={`Buscar ${name}`} value={q} onChange={event => { setQ(event.target.value); setPage(1); }} placeholder="Buscar por nome ou código" className="block h-8 w-full rounded border px-2" />
    {multiple && <input name={name} type="hidden" value={selection.map(item => item.id).join(",")} />}
    <select name={multiple ? undefined : name} value={multiple ? "" : value} required={!multiple && required} onChange={event => {
      const item = items.find(item => item.id === event.target.value);
      if (multiple) { if (item && !selection.some(selected => selected.id === item.id)) setSelection([...selection, item]); }
      else { setValue(event.target.value); setSelectedLabel(item?.label || ""); }
    }} className="block h-8 w-full rounded border px-2">
      <option value="">Selecione</option>
      {value && !items.some(item => item.id === value) && <option value={value}>{selectedLabel}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {multiple && <ul>{selection.map(item => <li key={item.id} className="flex justify-between gap-2"><span>{item.label}</span><button type="button" onClick={() => setSelection(selection.filter(selected => selected.id !== item.id))} aria-label={`Remover ${item.label}`}>Remover</button></li>)}</ul>}
    <div className="flex justify-between text-[10px]"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{total} registros · {page}</span><button type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Próxima</button></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
