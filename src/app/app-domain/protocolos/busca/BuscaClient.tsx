"use client";

import Link from "next/link";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Processo = { id: string; protocolNumber: string; status: string; createdAt: Date; processType: { name: string }; subject: { name: string }; person: { fullName: string } | null; company: { corporateName: string } | null };
const columns: OperationalColumn[] = [
  ...([["protocol", "Protocolo", 150, 110], ["type", "Tipo", 190, 100], ["subject", "Assunto", 240, 120], ["interested", "Interessado", 220, 120], ["date", "Abertura", 110, 95], ["status", "Status", 130, 90]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 80, minWidth: 65, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function BuscaClient({ processos, query, total, page }: { processos: Processo[]; query: string; total: number; page: number; pageSize: number }) {
  return <OperationalListFrame label="Buscar processos" toolbar={<form action="/protocolos/busca" method="GET" className={styles.searchForm}><input name="q" type="search" aria-label="Buscar processo" defaultValue={query} placeholder="Buscar protocolo, interessado, tipo ou assunto…" className={styles.searchInput} /><button className={styles.filterButton}>Pesquisar</button><Link className={styles.filterButton} href="/protocolos/busca">Limpar</Link></form>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/busca" values={{ q: query }} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.busca" caption="Resultados da busca de processos" emptyMessage="Nenhum processo encontrado." rows={processos.map(processo => ({ id: processo.id, label: processo.protocolNumber, values: { protocol: processo.protocolNumber, type: processo.processType.name, subject: processo.subject.name, interested: processo.person?.fullName || processo.company?.corporateName || "Não informado", date: new Date(processo.createdAt).toLocaleDateString("pt-BR"), status: processo.status }, actions: <Link className={styles.dialogButton} style={{ minHeight: "1.375rem", height: "1.375rem", padding: "0 4px" }} aria-label={`Abrir processo ${processo.protocolNumber}`} href={`/protocolos/processos/${processo.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
