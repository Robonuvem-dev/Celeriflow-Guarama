"use client";

import { useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export type EducationColumn = { key: string; label: string; responsive?: "sm" | "md" | "lg"; align?: "right" | "center"; width?: "narrow" | "medium" };
export type EducationRow = { id: string; cells: Record<string, string>; detail?: Record<string, string> };
type Props = { rows: EducationRow[]; columns: EducationColumn[]; searchPlaceholder: string; label: string; statusKey?: string; filterKey?: string; filterLabel?: string; actions?: boolean; detailTitleKey?: string };

export function EducationListClient({ rows, columns, searchPlaceholder, label, statusKey, filterKey, filterLabel = "Todos", actions = false, detailTitleKey }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const pathname = usePathname();
  const panel = !["/educacao/escolas", "/educacao/professores", "/educacao/calendario"].includes(pathname);
  const values = filterKey ? Array.from(new Set(rows.map((row) => row.cells[filterKey]).filter(Boolean))).sort() : [];
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) => (!term || Object.values(row.cells).some((value) => value.toLocaleLowerCase("pt-BR").includes(term))) && (!filterKey || !filter || row.cells[filterKey] === filter));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);
  const hasDetails = rows.some((row) => row.detail);
  const configuration: OperationalColumn[] = columns.map((column) => ({
    key: column.key, label: column.label, type: column.key === statusKey ? "status" : "text", align: column.align,
    initialWidth: column.width === "narrow" ? 90 : column.width === "medium" ? 140 : 210,
    minWidth: column.width === "narrow" ? 64 : column.width === "medium" ? 80 : 96,
    resizable: true, sortable: false, details: "overflow",
  }));
  if (hasDetails) configuration.push({ key: "__detail", label: "Detalhes", type: "text", initialWidth: 150, minWidth: 80, resizable: true, sortable: false, details: "overflow" });
  if (actions) configuration.push({ key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 80, maxWidth: 80, resizable: false, sortable: false, details: "none" });
  const exportCsv = () => {
    const escape = (text: string) => `"${text.replaceAll('"', '""')}"`;
    const csv = [columns.map((column) => escape(column.label)).join(";"), ...filtered.map((row) => columns.map((column) => escape(row.cells[column.key] || "")).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${label.replaceAll(" ", "-")}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const list = <OperationalListFrame
      actions={<button type="button" onClick={exportCsv} className={styles.dialogButton}><Download />Exportar CSV</button>}
      toolbar={<div className="flex w-full min-w-0 gap-2"><input aria-label={`Buscar ${label}`} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={searchPlaceholder} className={styles.searchInput} />{filterKey && <select aria-label={filterLabel} value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border px-2 text-sm"><option value="">{filterLabel}</option>{values.map((value) => <option key={value}>{value}</option>)}</select>}</div>}
      pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
      <OperationalTable caption={`Educação — ${label}`} emptyMessage="Nenhum registro encontrado." preferenceId={`educacao-${label}-${columns.map((column) => column.key).join("-")}`} columns={configuration} rows={visible.map((row) => ({
        id: row.id, label: row.cells[detailTitleKey || columns[0].key] || row.id,
        values: { ...row.cells, __detail: Object.entries(row.detail || {}).map(([key, value]) => `${key}: ${value}`).join("\n") },
        actions: actions ? <div className={styles.rowActions}><button type="button" className={styles.iconButton} aria-label="Editar"><Pencil /></button><button type="button" className={styles.iconButton} aria-label="Inativar"><Trash2 /></button></div> : undefined,
      }))} />
    </OperationalListFrame>;
  return panel ? <OperationalTablePanel title={`Educação — ${label}`} triggerLabel={`Consultar ${label}`} description="A consulta usa uma área própria; formulários e atividades da página são preservados.">{list}</OperationalTablePanel> : list;
}
