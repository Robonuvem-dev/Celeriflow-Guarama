"use client";

import { useState } from "react";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { healthColumn } from "./operational-columns";

type Column = { key: string; label: string; responsive?: "sm" | "md" | "lg"; align?: "right" | "center"; width?: "narrow" | "medium" };
type Row = { id: string; cells: Record<string, string> };
type ServerPagination = { page: number; total: number; pathname: string; search?: string; filter?: string; filterOptions?: string[]; extra?: Record<string, string | undefined> };
type Props = { rows: Row[]; columns: Column[]; label: string; searchPlaceholder: string; filterKey?: string; filterLabel?: string; serverPagination?: ServerPagination };

export function HealthSimpleListClient({ rows, columns, label, searchPlaceholder, filterKey, filterLabel = "Todos", serverPagination }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const values = serverPagination?.filterOptions || (filterKey ? [...new Set(rows.map(row => row.cells[filterKey]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")) : []);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = serverPagination ? rows : rows.filter(row => (!term || Object.values(row.cells).some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!filterKey || !filter || row.cells[filterKey] === filter));
  const activePage = serverPagination?.page || Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visible = serverPagination ? rows : filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);
  const total = serverPagination?.total ?? filtered.length;
  const fields = columns.map(column => healthColumn(column.key, column.label, column.width === "narrow" ? 90 : column.width === "medium" ? 140 : 220, column.width === "narrow" ? 64 : column.width === "medium" ? 88 : 110, column.key === "status" ? "status" : "text", column.align));

  return <OperationalListFrame label={label} toolbar={serverPagination ? <form method="get" action={serverPagination.pathname} className={styles.searchForm}>
    {Object.entries(serverPagination.extra || {}).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
    <input aria-label={`Buscar ${label}`} type="search" name="q" defaultValue={serverPagination.search} placeholder={searchPlaceholder} className={styles.searchInput} />
    {filterKey && <select aria-label={filterLabel} name="filter" defaultValue={serverPagination.filter}><option value="">{filterLabel}</option>{values.map(value => <option key={value}>{value}</option>)}</select>}<button className={styles.filterButton}>Buscar</button>
  </form> : <><input aria-label={`Buscar ${label}`} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={searchPlaceholder} className={styles.searchInput} />{filterKey && <select aria-label={filterLabel} value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="">{filterLabel}</option>{values.map(value => <option key={value}>{value}</option>)}</select>}</>}
    pagination={serverPagination ? <OperationalLinkPagination page={activePage} total={total} pathname={serverPagination.pathname} values={{ q: serverPagination.search, filter: serverPagination.filter, ...serverPagination.extra }} /> : <OperationalPagination page={activePage} total={total} onPageChange={setPage} />}>
    <OperationalTable columns={fields} rows={visible.map(row => ({ id: row.id, label: Object.values(row.cells)[0] || row.id, values: row.cells }))} preferenceId={`saude-simple-${serverPagination?.pathname || label}`} caption={label} emptyMessage="Nenhum registro encontrado." />
  </OperationalListFrame>;
}
