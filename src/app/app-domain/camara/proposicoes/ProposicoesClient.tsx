"use client";

import { useState } from "react";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { LegislativeRecordMenu } from "../components/LegislativeRecordMenu";

export type PropositionRow = { id: string; numero: string; tipo: string; autoria: string; assunto: string; data: string; status: string };
const columns: OperationalColumn[] = [
  { key: "numero", label: "Número", type: "identifier", initialWidth: 110, minWidth: 75, maxWidth: 220, resizable: true, sortable: false, details: "overflow" },
  { key: "tipo", label: "Tipo", type: "text", initialWidth: 140, minWidth: 90, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "autoria", label: "Autoria", type: "text", initialWidth: 170, minWidth: 100, maxWidth: 400, resizable: true, sortable: false, details: "overflow" },
  { key: "assunto", label: "Assunto", type: "text", initialWidth: 320, minWidth: 120, maxWidth: 900, resizable: true, sortable: false, details: "overflow" },
  { key: "data", label: "Data", type: "text", initialWidth: 110, minWidth: 95, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 90, minWidth: 80, maxWidth: 110, resizable: false, sortable: false, details: "none" },
];
export function ProposicoesClient({ rows }: { rows: PropositionRow[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const types = Array.from(new Set(rows.map((row) => row.tipo))).sort();
  const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) => (!term || [row.numero, row.autoria, row.assunto].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))) && (!type || row.tipo === type) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Proposições" toolbar={<><input type="search" aria-label="Buscar proposições" className={styles.searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar número, assunto ou autoria…" /><OperationalFilters activeCount={Number(!!type) + Number(!!status)}><label>Tipo<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Todos os tipos</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setType(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="camara.proposicoes" caption="Proposições legislativas" emptyMessage="Nenhuma proposição encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map((row) => ({ id: row.id, label: `${row.tipo} ${row.numero}`, values: { ...row, data: new Date(row.data).toLocaleDateString("pt-BR") }, actions: <LegislativeRecordMenu label={`${row.tipo} ${row.numero}`}><dl className={styles.filterFields}><div><dt>Proposição</dt><dd>{row.tipo} {row.numero}</dd></div><div><dt>Autoria</dt><dd>{row.autoria}</dd></div><div><dt>Data</dt><dd>{new Date(row.data).toLocaleDateString("pt-BR")}</dd></div><div><dt>Situação</dt><dd>{row.status}</dd></div></dl><p>O assunto integral está disponível na coluna Assunto, com leitura por trechos quando necessário.</p></LegislativeRecordMenu> }))} />
  </OperationalListFrame>;
}
