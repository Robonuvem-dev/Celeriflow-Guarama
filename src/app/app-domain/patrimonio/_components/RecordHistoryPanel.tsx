"use client";

import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

// Full, already loaded histories only. Server-paginated histories compose the base directly.
export function RecordHistoryPanel({ title, description, columns, rows, preferenceId, emptyMessage }: {
  title: string; description?: string; columns: OperationalColumn[]; rows: OperationalRow[]; preferenceId: string; emptyMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter(row => !query || Object.values(row.values).some(value => value.toLocaleLowerCase("pt-BR").includes(query)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalTablePanel title={title} description={description}>
    <OperationalListFrame toolbar={<input type="search" aria-label={`Pesquisar ${title}`} placeholder="Pesquisar no histórico" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />}
      pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} preferenceId={preferenceId} caption={title} emptyMessage={emptyMessage} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
