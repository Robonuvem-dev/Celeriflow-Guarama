"use client";

import { useState } from "react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ContentPreview } from "../ContentPreview";

export type BannerRow = { id: string; title: string; imageUrl: string; linkUrl: string | null; position: string; order: number; status: string; startDate: string | null; endDate: string | null };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Sem limite";
const columns: OperationalColumn[] = [
  ...([["title", "Título", 280, 120], ["position", "Posição", 150, 95], ["start", "Vigência inicial", 130, 110], ["end", "Vigência final", 130, 110], ["order", "Ordem", 85, 65], ["status", "Situação", 120, 85]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 700, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow", align: key === "order" ? "right" : "left" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 65, minWidth: 50, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];
export function BannersClient({ rows }: { rows: BannerRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const positions = Array.from(new Set(rows.map(row => row.position))).sort();
  const statuses = Array.from(new Set(rows.map(row => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter(row => (!term || [row.title, row.position, row.linkUrl || ""].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!position || row.position === position) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Banners" toolbar={<><input aria-label="Buscar banners" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar título, posição ou link…" /><OperationalFilters activeCount={Number(!!position) + Number(!!status)}><label>Posição<select value={position} onChange={event => { setPosition(event.target.value); setPage(1); }}><option value="">Todas as posições</option>{positions.map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setPosition(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.banners" caption="Banners do portal" emptyMessage="Nenhum banner encontrado." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.id, label: row.title, values: { title: row.title, position: row.position, start: formatDate(row.startDate), end: formatDate(row.endDate), order: String(row.order), status: row.status }, actions: <ContentPreview title={row.title} description="Prévia do banner" imageUrl={row.imageUrl} text={`${row.position}\n${row.status}\nVigência: ${formatDate(row.startDate)} — ${formatDate(row.endDate)}\nOrdem: ${row.order}\nDestino: ${row.linkUrl || "Sem destino"}`} /> }))} />
  </OperationalListFrame>;
}
