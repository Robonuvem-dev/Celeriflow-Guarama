"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import { comprasPage } from "./pagination";
import styles from "@/components/app-ui/operational/operational.module.css";
export { comprasColumn } from "./columns";

export type ComprasListRow = OperationalRow & { search: string; filters?: Record<string, string> };
type ListFilter = { key: string; label: string; options: { value: string; label: string }[] };

export function ComprasOperationalList({ rows, columns, preferenceId, label, actions, filters = [], description, editable = false }: {
  rows: ComprasListRow[];
  columns: OperationalColumn[];
  preferenceId: string;
  label: string;
  actions?: ReactNode;
  filters?: ListFilter[];
  description?: string;
  editable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [appliedIds, setAppliedIds] = useState<Set<string> | null>(null);
  const search = useDeferredValue(query).trim().toLocaleLowerCase("pt-BR");
  const matches = (row: ComprasListRow, term: string) => (!term || row.search.toLocaleLowerCase("pt-BR").includes(term)) && filters.every((filter) => !selected[filter.key] || row.filters?.[filter.key] === selected[filter.key]);
  // Keep live row/cell objects (and their current handlers), freezing membership only.
  // Recomputing membership from an edited value would unmount the focused input.
  const filtered = editable ? (appliedIds ? rows.filter((row) => appliedIds.has(row.id)) : rows) : rows.filter((row) => matches(row, search));
  const { page: currentPage, rows: visibleRows } = comprasPage(filtered, page);
  const activeCount = Object.values(selected).filter(Boolean).length;

  return <OperationalListFrame label={label} actions={actions}
    toolbar={<>
      {editable ? <form className={styles.searchForm} onSubmit={(event) => {
        event.preventDefault(); event.stopPropagation();
        const term = query.trim().toLocaleLowerCase("pt-BR");
        setAppliedIds(new Set(rows.filter((row) => matches(row, term)).map((row) => row.id)));
        setPage(1);
      }}>
        <label className="flex min-w-0 flex-1"><span className={styles.srOnly}>Buscar em {label}</span><input type="search" className={styles.searchInput} value={query} placeholder={`Buscar em ${label.toLocaleLowerCase("pt-BR")}`} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="submit" className={styles.filterButton} title="Recalcular a busca sobre todos os rascunhos atuais">Aplicar busca</button>
      </form> : <label className="flex min-w-0 flex-1 items-center gap-2"><span className={styles.srOnly}>Buscar em {label}</span><input type="search" className={styles.searchInput} value={query} placeholder={`Buscar em ${label.toLocaleLowerCase("pt-BR")}`} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>}
      {(filters.length > 0 || description) && <OperationalFilters activeCount={activeCount}>
        <div className={styles.filterFields}>{filters.map((filter) => <label key={filter.key}>{filter.label}<select aria-label={filter.label} value={selected[filter.key] ?? ""} onChange={(event) => { setSelected((current) => ({ ...current, [filter.key]: event.target.value })); setPage(1); }}><option value="">Todas</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
          {description && <p>{description}</p>}
        </div>
      </OperationalFilters>}
      {(query || activeCount > 0 || appliedIds !== null) && <button type="button" className={styles.filterButton} onClick={() => { setQuery(""); setSelected({}); setAppliedIds(null); setPage(1); }}>Limpar</button>}
    </>}
    pagination={<OperationalPagination page={currentPage} total={filtered.length} pending={!editable && query.trim().toLocaleLowerCase("pt-BR") !== search} onPageChange={setPage} />}>
    <OperationalTable columns={columns} rows={visibleRows} preferenceId={preferenceId} caption={label} emptyMessage={`Nenhum registro encontrado em ${label.toLocaleLowerCase("pt-BR")}.`} />
  </OperationalListFrame>;
}

export function comprasOptions(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "pt-BR")).map((value) => ({ value, label: value }));
}
