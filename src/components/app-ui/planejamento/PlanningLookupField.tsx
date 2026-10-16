"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchPlanningOptions } from "@/app/app-domain/planejamento/actions";
import type { PlanningJurisdiction } from "@/lib/planejamento/policy";

export function PlanningLookupField({ jurisdiction, name, label, value = "", options = [], required = false, multiple = false, hidden = {}, operation, onChange, submitName = true, submitAs }: { jurisdiction: PlanningJurisdiction; name: string; label: string; value?: string; options?: { id: string; name: string }[]; required?: boolean; multiple?: boolean; hidden?: Record<string, string>; operation?: string; onChange?: (value: string) => void; submitName?: boolean; submitAs?: string }) {
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [records, setRecords] = useState(options); const [selected, setSelected] = useState(value.split(",").filter(Boolean)); const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries(options.map((option) => [option.id, option.name]))); const [error, setError] = useState("");
  const instrumentId = hidden.instrumentId ?? "";
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const result = await searchPlanningOptions(jurisdiction, { field: name, q: query, page: String(page), ...(instrumentId ? { instrumentId } : {}), operation: operation ?? "", ...(hidden.amendmentId ? { amendmentId: hidden.amendmentId } : {}), ...(hidden.catalogKind ? { catalogKind: hidden.catalogKind } : {}), ...(hidden.canonicalId ? { canonicalId: hidden.canonicalId } : {}), ...(name === "parentId" && hidden.kind ? { parentKind: hidden.kind === "LDO" ? "PPA" : "LDO" } : {}) });
      if (alive) { setRecords(result.options); setTotal(result.total); setLabels((previous) => ({ ...previous, ...Object.fromEntries(result.options.map((option) => [option.id, option.name])) })); setError(result.error ?? ""); }
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [jurisdiction, name, query, page, instrumentId, operation, hidden.amendmentId, hidden.kind, hidden.catalogKind, hidden.canonicalId]);
  const update = (values: string[]) => { setSelected(values); onChange?.(values.join(",")); };
  return <div className="space-y-1"><Input aria-label={`Pesquisar ${label}`} placeholder={`Pesquisar ${label.toLocaleLowerCase()}`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    {!multiple ? <select aria-label={label} name={submitName ? submitAs ?? name : undefined} required={required} value={selected[0] ?? ""} onChange={(event) => update(event.target.value ? [event.target.value] : [])} className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">Selecione</option>{selected.filter((id) => !records.some((record) => record.id === id)).map((id) => <option key={id} value={id}>{labels[id] ?? "Seleção preservada"}</option>)}{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select> : <><div className="space-y-1 rounded border p-2">{records.map((record) => <label key={record.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(record.id)} onChange={(event) => update(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} />{record.name}</label>)}</div>{selected.map((id) => <input key={id} type="hidden" name={submitAs ?? name} value={id} />)}<p className="text-xs">{selected.length} selecionado(s), preservados entre páginas.</p></>}
    <div className="flex items-center gap-2 text-xs"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span>{page} / {Math.max(1, Math.ceil(total / 20))}</span><Button type="button" variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Próxima</Button></div>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
