"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "protocol", label: "Protocolo", type: "identifier", initialWidth: 160, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 130, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "subject", label: "Assunto", type: "text", initialWidth: 260, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "requester", label: "Manifestante", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Abertura", type: "text", initialWidth: 110, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 70, minWidth: 60, maxWidth: 85, resizable: false, sortable: false, details: "none" },
];

type Ombudsman = {
  id: string; protocolNumber: string; type: string; subject: string; isAnonymous: boolean;
  isConfidential: boolean; status: string; createdAt: Date; person: { fullName: string } | null;
};

export default function OuvidoriaClient({ initialManifestacoes, canManage }: { initialManifestacoes: Ombudsman[]; canManage: boolean }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(1);
  const filtered = initialManifestacoes.filter((item) => {
    const search = searchTerm.trim().toLowerCase();
    return (!search || item.protocolNumber.toLowerCase().includes(search) || item.subject.toLowerCase().includes(search) || item.person?.fullName.toLowerCase().includes(search)) && (!filterType || item.type === filterType);
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const rows = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return <OperationalListFrame label="Ouvidoria"
    actions={canManage ? <Link href="/atendimento/ouvidoria/nova" className={styles.newButton}>Nova manifestação</Link> : undefined}
    toolbar={<>
      <input type="search" aria-label="Buscar manifestação" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Protocolo, assunto ou manifestante" className={styles.searchInput} />
      <OperationalFilters activeCount={filterType ? 1 : 0}><label>Tipo<select value={filterType} onChange={(event) => { setFilterType(event.target.value); setPage(1); }}><option value="">Todos os tipos</option><option>Denúncia</option><option>Reclamação</option><option>Sugestão</option><option>Elogio</option></select></label><button className={styles.dialogButton} onClick={() => { setFilterType(""); setPage(1); }}>Limpar tipo</button></OperationalFilters>
      <OperationalFilters label="Privacidade"><p>Área Restrita (LGPD). Denúncias anônimas e informações sigilosas são protegidas por lei. O vazamento de dados desta tela configura infração grave.</p></OperationalFilters>
    </>}
    pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="atendimento-ouvidoria" caption="Manifestações de ouvidoria" emptyMessage="Nenhuma manifestação encontrada." rows={rows.map((item) => ({
      id: item.id, label: item.protocolNumber,
      values: { protocol: item.protocolNumber, type: item.type, subject: item.subject, requester: item.isAnonymous ? "Anônimo" : item.person?.fullName || "Identidade restrita", date: new Date(item.createdAt).toLocaleDateString("pt-BR"), status: item.status },
      actions: <div className={styles.rowActions}><Link href={`/atendimento/ouvidoria/${item.id}`} aria-label={`Abrir manifestação ${item.protocolNumber}`} title="Abrir manifestação" className={styles.iconButton}><ExternalLink /></Link></div>,
    }))} />
  </OperationalListFrame>;
}
