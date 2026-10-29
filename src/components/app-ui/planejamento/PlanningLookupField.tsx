"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchPlanningOptions } from "@/app/app-domain/planejamento/actions";
import type { PlanningJurisdiction } from "@/lib/planejamento/policy";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { DialogClose } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export function PlanningLookupField({ jurisdiction, name, label, value = "", options = [], required = false, multiple = false, hidden = {}, operation, onChange, submitName = true, submitAs, compact = false, controlId, disabled = false }: { jurisdiction: PlanningJurisdiction; name: string; label: string; value?: string; options?: { id: string; name: string }[]; required?: boolean; multiple?: boolean; hidden?: Record<string, string>; operation?: string; onChange?: (value: string) => void; submitName?: boolean; submitAs?: string; compact?: boolean; controlId?: string; disabled?: boolean }) {
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const [total, setTotal] = useState(options.length); const [records, setRecords] = useState(compact || multiple ? options.slice(0, OPERATIONAL_PAGE_SIZE) : options); const [selected, setSelected] = useState(value.split(",").filter(Boolean)); const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries(options.map((option) => [option.id, option.name]))); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const instrumentId = hidden.instrumentId ?? "";
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchPlanningOptions(jurisdiction, { field: name, q: query, page: String(page), ...(instrumentId ? { instrumentId } : {}), operation: operation ?? "", ...(hidden.amendmentId ? { amendmentId: hidden.amendmentId } : {}), ...(hidden.catalogKind ? { catalogKind: hidden.catalogKind } : {}), ...(hidden.canonicalId ? { canonicalId: hidden.canonicalId } : {}), ...(name === "parentId" && hidden.kind ? { parentKind: hidden.kind === "LDO" ? "PPA" : "LDO" } : {}) });
        if (alive) { setRecords(result.options); setTotal(result.total); setLabels(previous => ({ ...previous, ...Object.fromEntries(result.options.map(option => [option.id, option.name])) })); setError(result.error ?? ""); }
      } catch { if (alive) setError("Não foi possível consultar as opções. Tente novamente."); }
      finally { if (alive) setLoading(false); }
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [jurisdiction, name, query, page, instrumentId, operation, hidden.amendmentId, hidden.kind, hidden.catalogKind, hidden.canonicalId, retry]);
  const update = (values: string[]) => { setSelected(values); onChange?.(values.join(",")); };
  if (compact || multiple) return <span id={controlId} tabIndex={-1} aria-label={label} className="inline-flex h-6 w-full min-w-0 [&>button]:h-6 [&>button]:w-full [&>button]:truncate [&>button]:px-1">
    {submitName && selected.map(id => <input key={id} type="hidden" name={submitAs ?? name} value={id} />)}
    <OperationalTablePanel title={label} triggerLabel={multiple ? `${selected.length} selecionado(s) · ${label}` : selected.map(id => labels[id] ?? id).join(", ") || "Selecionar"}>
      <div className="contents" onSubmit={event => event.stopPropagation()}><OperationalListFrame label={label} actions={!required && <DialogClose render={<button type="button" disabled={disabled} className={styles.dialogButton} onClick={() => update([])} />}>Limpar seleção</DialogClose>}
        toolbar={<input aria-label={`Pesquisar ${label}`} className={styles.searchInput} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />}
        pagination={<OperationalPagination page={page} total={total} pending={loading} onPageChange={setPage} />}>
        <OperationalTable preferenceId={`planning:lookup:${name}`} caption={label} state={loading ? "loading" : error ? "error" : "ready"} errorMessage={error} onRetry={() => setRetry(value => value + 1)}
          columns={[{ key: "label", label: "Descrição", type: "text", minWidth: 220, initialWidth: 600, resizable: true, sortable: false, details: "overflow" }, { key: "actions", label: "Selecionar", type: "actions", minWidth: 100, initialWidth: 110, resizable: false, sortable: false, details: "none" }]}
          rows={records.map(record => ({ id: record.id, label: record.name, values: { label: record.name }, actions: multiple ? <input type="checkbox" disabled={disabled} aria-label={`Selecionar ${record.name}`} checked={selected.includes(record.id)} onChange={event => update(event.target.checked ? [...selected, record.id] : selected.filter(id => id !== record.id))} /> : <DialogClose render={<button type="button" disabled={disabled} className={styles.dialogButton} onClick={() => update([record.id])} />}>Selecionar</DialogClose> }))} />
      </OperationalListFrame></div>
    </OperationalTablePanel>
  </span>;
  return <div className="space-y-1"><Input aria-label={`Pesquisar ${label}`} placeholder={`Pesquisar ${label.toLocaleLowerCase()}`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    <select aria-label={label} disabled={disabled} name={submitName ? submitAs ?? name : undefined} required={required} value={selected[0] ?? ""} onChange={(event) => update(event.target.value ? [event.target.value] : [])} className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">Selecione</option>{selected.filter((id) => !records.some((record) => record.id === id)).map((id) => <option key={id} value={id}>{labels[id] ?? "Seleção preservada"}</option>)}{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select>
    <div className="flex items-center gap-2 text-xs"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span>{page} / {Math.max(1, Math.ceil(total / 20))}</span><Button type="button" variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Próxima</Button></div>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
