"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ContentPreview } from "../ContentPreview";

export type BiddingRow = { id: string; number: string; processNumber: string; modality: string; object: string; estimatedValue: number; openingDate: string | null; status: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const columns: OperationalColumn[] = [
  ...([["number", "Número", 110, 85], ["process", "Processo", 120, 90], ["modality", "Modalidade", 160, 100], ["object", "Objeto", 310, 120], ["opening", "Abertura", 110, 95], ["status", "Situação", 180, 100]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 800, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 70, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export function LicitacoesClient({ rows }: { rows: BiddingRow[] }) {
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const modalities = Array.from(new Set(rows.map(row => row.modality))).sort();
  const statuses = Array.from(new Set(rows.map(row => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter(row => (!term || [row.number, row.processNumber, row.object, row.modality].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!modality || row.modality === modality) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Licitações" toolbar={<><input aria-label="Buscar licitações" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar número, processo ou objeto…" /><OperationalFilters activeCount={Number(!!modality) + Number(!!status)}><label>Modalidade<select value={modality} onChange={event => { setModality(event.target.value); setPage(1); }}><option value="">Todas as modalidades</option>{modalities.map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setModality(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.licitacoes" caption="Licitações abertas" emptyMessage="Nenhuma licitação encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.id, label: row.number, values: { number: row.number, process: row.processNumber, modality: row.modality, object: row.object, opening: row.openingDate ? new Date(row.openingDate).toLocaleDateString("pt-BR") : "—", status: row.status }, actions: <div className={styles.rowActions}><ContentPreview title={`Licitação ${row.number}`} description="Objeto e dados da licitação" text={`Processo: ${row.processNumber}\n${row.modality}\n${row.status}\n${row.object}\nAbertura: ${row.openingDate ? new Date(row.openingDate).toLocaleDateString("pt-BR") : "Não informada"}\nValor estimado: ${money.format(row.estimatedValue)}`} /><button type="button" className={styles.iconButton} aria-label={`Baixar edital ${row.number}`} title="Baixar edital"><Download /></button></div> }))} />
  </OperationalListFrame>;
}
