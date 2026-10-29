"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

/** Read-only, already-loaded financial results. Never pass a partial server page here. */
export default function FinanceOperationalList({ columns, rows, preferenceId, label, toolbar, actions, state = "ready", errorMessage, resetKey = "", searchable = true }: {
  columns: OperationalColumn[]; rows: OperationalRow[]; preferenceId: string; label: string;
  toolbar?: ReactNode; actions?: ReactNode; state?: "ready" | "loading" | "error"; errorMessage?: string;
  resetKey?: string; searchable?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [requestedPage, setPage] = useState(1);
  const [previousReset, setPreviousReset] = useState(resetKey);
  if (previousReset !== resetKey) { setPreviousReset(resetKey); setPage(1); }
  const filtered = search ? rows.filter(row => Object.values(row.values).some(value => value.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  if (requestedPage > pages) setPage(pages);
  return <OperationalListFrame label={label} actions={actions} toolbar={<>
    {searchable && <input aria-label={`Buscar em ${label}`} placeholder="Buscar…" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />}
    {toolbar}
  </>} pagination={<OperationalPagination page={page} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} rows={filtered.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE)} preferenceId={preferenceId} caption={label} emptyMessage="Nenhum registro encontrado." state={state} errorMessage={errorMessage} onRetry={() => router.refresh()} />
  </OperationalListFrame>;
}
