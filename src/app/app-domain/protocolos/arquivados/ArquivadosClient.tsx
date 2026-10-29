"use client";

import Link from "next/link";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Processo = { id: string; protocolNumber: string; status: string; archivedAt: Date | null; processType: { name: string }; subject: { name: string }; person: { fullName: string } | null; company: { corporateName: string } | null };
const columns: OperationalColumn[] = [
  ...([["protocol", "Protocolo", 150, 110], ["type", "Tipo", 190, 100], ["subject", "Assunto", 230, 120], ["interested", "Interessado", 220, 120], ["date", "Arquivado em", 120, 105], ["status", "Status", 130, 90]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 80, minWidth: 65, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function ArquivadosClient({ processos, query, total, page }: { processos: Processo[]; query: string; total: number; page: number; pageSize: number }) {
  return <OperationalListFrame label="Processos arquivados" toolbar={<form action="/protocolos/arquivados" method="GET" className={styles.searchForm}><input name="q" type="search" aria-label="Buscar nos processos arquivados" defaultValue={query} placeholder="Buscar número, interessado, tipo ou assunto arquivado…" className={styles.searchInput} /><button className={styles.filterButton}>Pesquisar</button><Link className={styles.filterButton} href="/protocolos/arquivados">Limpar</Link></form>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/arquivados" values={{ q: query }} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.arquivados" caption="Processos arquivados" emptyMessage="Nenhum processo arquivado encontrado." rows={processos.map(processo => ({ id: processo.id, label: processo.protocolNumber, values: { protocol: processo.protocolNumber, type: processo.processType.name, subject: processo.subject.name, interested: processo.person?.fullName || processo.company?.corporateName || "Não informado", date: processo.archivedAt ? new Date(processo.archivedAt).toLocaleDateString("pt-BR") : "—", status: processo.status }, actions: <Link className={styles.dialogButton} style={{ minHeight: "1.375rem", height: "1.375rem", padding: "0 4px" }} aria-label={`Abrir arquivo ${processo.protocolNumber}`} href={`/protocolos/processos/${processo.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
