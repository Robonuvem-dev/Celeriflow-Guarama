"use client";

import { useState } from "react";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { LegislativeRecordMenu } from "../components/LegislativeRecordMenu";

export type LawRow = { id: string; numero: string; tipo: string; ementa: string; autoria: string; publicacao: string | null; status: string };
const columns: OperationalColumn[] = [
  { key: "numero", label: "Número", type: "identifier", initialWidth: 100, minWidth: 75, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "tipo", label: "Tipo", type: "text", initialWidth: 140, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "ementa", label: "Ementa", type: "text", initialWidth: 340, minWidth: 120, maxWidth: 900, resizable: true, sortable: false, details: "overflow" },
  { key: "autoria", label: "Autoria", type: "text", initialWidth: 170, minWidth: 100, maxWidth: 400, resizable: true, sortable: false, details: "overflow" },
  { key: "publicacao", label: "Publicação", type: "text", initialWidth: 110, minWidth: 95, maxWidth: 220, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 90, minWidth: 80, maxWidth: 110, resizable: false, sortable: false, details: "none" },
];
export function LeisClient({ rows }: { rows: LawRow[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const types = Array.from(new Set(rows.map((row) => row.tipo))).sort();
  const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) => (!term || [row.numero, row.ementa, row.autoria].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))) && (!type || row.tipo === type) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Leis e atos" toolbar={<><input type="search" aria-label="Buscar leis" className={styles.searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar número, ementa ou autoria…" /><OperationalFilters activeCount={Number(!!type) + Number(!!status)}><label>Tipo<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Todos os tipos</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setType(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="camara.leis" caption="Leis e atos normativos" emptyMessage="Nenhum ato encontrado." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map((row) => ({ id: row.id, label: `${row.tipo} ${row.numero}`, values: { ...row, publicacao: row.publicacao ? new Date(row.publicacao).toLocaleDateString("pt-BR") : "—" }, actions: <LegislativeRecordMenu label={`${row.tipo} ${row.numero}`}><dl className={styles.filterFields}><div><dt>Ato</dt><dd>{row.tipo} {row.numero}</dd></div><div><dt>Autoria</dt><dd>{row.autoria}</dd></div><div><dt>Publicação</dt><dd>{row.publicacao ? new Date(row.publicacao).toLocaleDateString("pt-BR") : "—"}</dd></div><div><dt>Situação</dt><dd>{row.status}</dd></div></dl><p>A ementa integral está disponível na coluna Ementa, com leitura por trechos quando necessário.</p></LegislativeRecordMenu> }))} />
  </OperationalListFrame>;
}
