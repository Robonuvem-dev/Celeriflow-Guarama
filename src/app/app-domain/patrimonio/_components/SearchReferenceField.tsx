"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "./operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

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
  const [retry, setRetry] = useState(0);
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
  }, [kind, search, page, filterQuery, retry]);

  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block text-xs font-semibold text-slate-700">{label}</label>
    {value ? <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs"><span className="min-w-0 font-medium text-emerald-900">{selectedLabel}</span><button type="button" onClick={() => { onSelect(null); setPage(1); }} className="shrink-0 text-emerald-800 underline">Alterar</button></div> : <OperationalTablePanel title={label} triggerLabel="Pesquisar e selecionar" description="Referências disponíveis conforme os filtros e permissões da requisição.">
      <OperationalListFrame label={label} toolbar={<><input id={id} aria-label={label} type="search" autoComplete="off" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={kind === "materials" ? "Pesquisar código, nome ou descrição" : "Pesquisar nome ou matrícula"} className={styles.searchInput} />{children && <OperationalFilters>{children}</OperationalFilters>}</>}
        pagination={<OperationalPagination page={page} total={result.total} pending={loading} onPageChange={setPage} />}>
        <OperationalTable preferenceId={`patrimonio-requisicao-referencias-${kind}`} caption={label} state={loading ? "loading" : error ? "error" : "ready"} errorMessage={error} loadingMessage="Pesquisando referências…" emptyMessage="Nenhum registro encontrado. Ajuste a pesquisa ou os filtros." onRetry={() => setRetry(current => current + 1)} columns={operationalColumns([
          ["label", "Referência", 350, 140, "identifier"], ["detail", "Descrição", 350, 150], ["unit", "Unidade", 100, 65], ["quantity", "Saldo", 120, 80, "text", "right"], ["actions", "Selecionar", 65, 50, "actions"],
        ])} rows={result.records.slice(0, OPERATIONAL_PAGE_SIZE).map(record => ({ id: record.id, label: record.label, values: { label: record.label, detail: record.detail || "—", unit: record.unitOfMeasure || "—", quantity: record.quantity?.toLocaleString("pt-BR") ?? "—" }, actions: <button type="button" className={styles.iconButton} aria-label={`Selecionar ${record.label}`} onClick={() => onSelect(record)}><Check /></button> }))} />
      </OperationalListFrame>
    </OperationalTablePanel>}
  </div>;
}
