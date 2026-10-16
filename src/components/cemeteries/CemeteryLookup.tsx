"use client";

import { useEffect, useId, useState } from "react";

type Item = { id: string; label: string };
type Props = { name: string; kind: string; label: string; required?: boolean; value?: string; defaultValue?: string; onChange?: (value: string) => void; cemeteryId?: string; personOnly?: boolean; initialLabel?: string };

export function CemeteryLookup({ name, kind, label, required, value, defaultValue, onChange, cemeteryId, personOnly, initialLabel }: Props) {
  const id = useId();
  const [selected, setSelected] = useState(value || defaultValue || "");
  const [selectedLabel, setSelectedLabel] = useState(initialLabel || value || defaultValue || "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ kind, q, page: String(page), cemeteryId: cemeteryId || "", personOnly: String(Boolean(personOnly)) });
        const response = await fetch(`/api/cemiterios/referencias?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Consulta indisponível.");
        setItems(data.items); setTotal(data.total);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Consulta indisponível."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [kind, q, page, cemeteryId, personOnly]);
  const current = value ?? selected;
  return <fieldset className="grid gap-1 text-sm"><label htmlFor={id} className="font-medium">{label}{required ? " *" : ""}</label>
    <input id={id} aria-label={`Buscar ${label}`} className="rounded border p-2" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Pesquisar nome ou identificação" />
    <select name={name} required={required} aria-label={label} className="rounded border p-2" value={current} onChange={e => { const item = items.find(i => i.id === e.target.value); setSelected(e.target.value); setSelectedLabel(item?.label || ""); onChange?.(e.target.value); }}>
      <option value="">Selecione</option>{current && !items.some(i => i.id === current) && <option value={current}>{selectedLabel || current}</option>}{items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
    </select>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex items-center gap-2 text-xs"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Anterior</button><span aria-live="polite">{loading ? "Buscando…" : `${total} registros · página ${page}`}</span><button type="button" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>Próxima</button></div>
  </fieldset>;
}
export default CemeteryLookup;
