"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ContentPreview } from "../ContentPreview";

export type ContractRow = { id: string; number: string; supplierName: string; object: string; startDate: string; endDate: string; value: number; status: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");
const columns: OperationalColumn[] = [
  ...([["number", "Número", 120, 85], ["supplier", "Fornecedor", 220, 110], ["object", "Objeto", 300, 120], ["start", "Início", 110, 95], ["end", "Fim", 110, 95], ["value", "Valor", 140, 110], ["status", "Situação", 130, 85]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 800, type: key === "status" ? "status" : key === "number" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow", align: key === "value" ? "right" : "left" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 70, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export function ContratosClient({ rows }: { rows: ContractRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const statuses = Array.from(new Set(rows.map(row => row.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter(row => (!term || [row.number, row.supplierName, row.object].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Contratos públicos" toolbar={<><input aria-label="Buscar contratos" className={styles.searchInput} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar número, fornecedor ou objeto…" /><select aria-label="Situação do contrato" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.contratos" caption="Contratos públicos" emptyMessage="Nenhum contrato encontrado." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.id, label: row.number, values: { number: row.number, supplier: row.supplierName, object: row.object, start: date(row.startDate), end: date(row.endDate), value: money.format(row.value), status: row.status }, actions: <div className={styles.rowActions}><ContentPreview title={`Contrato ${row.number}`} description="Objeto, vigência e valor atualizado" text={`${row.supplierName}\n${row.status}\n${row.object}\nVigência: ${date(row.startDate)} — ${date(row.endDate)}\nValor atualizado: ${money.format(row.value)}`} /><Link href="/compras/contratos" aria-label={`Abrir contrato ${row.number} em Compras`} className={styles.iconButton}><ExternalLink /></Link></div> }))} />
  </OperationalListFrame>;
}
