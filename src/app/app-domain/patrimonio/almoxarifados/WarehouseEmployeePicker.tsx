"use client";

import { useEffect, useState } from "react";

type Option = { id: string; label: string };

export function WarehouseEmployeePicker({ value, selectedLabel, onChange }: { value: string; selectedLabel: string; onChange: (id: string, label: string) => void }) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/patrimonio/referencias?${new URLSearchParams({ kind: "employees", q: search })}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível buscar os servidores.");
        setOptions(result.options);
      } catch (error) {
        if (!controller.signal.aborted) { setOptions([]); setError(error instanceof Error ? error.message : "Falha na busca."); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);

  return <div className="space-y-2">
    <label htmlFor="warehouse-manager-search" className="text-sm font-medium">Responsável *</label>
    <input id="warehouse-manager-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar servidor por nome ou matrícula" className="h-9 w-full rounded-md border px-3 text-sm" />
    <select aria-label="Selecionar servidor responsável" name="managerId" required value={value} onChange={event => onChange(event.target.value, options.find(option => option.id === event.target.value)?.label || "")} className="h-9 w-full rounded-md border bg-white px-3 text-sm" aria-busy={loading}>
      <option value="" disabled>Selecione um servidor cadastrado</option>
      {value && !options.some(option => option.id === value) && <option value={value}>{selectedLabel}</option>}
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-red-700" : "text-slate-500"}`}>{error || (loading ? "Buscando servidores..." : options.length ? "Até 20 resultados. Refine pelo nome ou matrícula." : "Nenhum servidor ativo encontrado para esta pesquisa.")}</p>
  </div>;
}
