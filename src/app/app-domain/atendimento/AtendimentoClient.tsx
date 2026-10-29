"use client";

import { useState } from "react";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { updateTicketStatus } from "./actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: Date;
  person: { fullName: string } | null;
  channel: { name: string };
}

const columns: OperationalColumn[] = [
  { key: "number", label: "Número", type: "identifier", initialWidth: 130, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "subject", label: "Assunto", type: "text", initialWidth: 180, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "description", label: "Descrição", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "channel", label: "Canal", type: "text", initialWidth: 120, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "requester", label: "Solicitante", type: "text", initialWidth: 170, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Abertura", type: "text", initialWidth: 110, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "priority", label: "Prioridade", type: "status", initialWidth: 100, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ação rápida", type: "actions", initialWidth: 110, minWidth: 100, maxWidth: 130, resizable: false, sortable: false, details: "none" },
];

export default function AtendimentoClient({ initialTickets }: { initialTickets: Ticket[] }) {
  // O painel pode desmontar ao fechar; consulta, página e resultados ficam no pai.
  const [searchTerm, setSearchTerm] = useState("");
  const [tickets, setTickets] = useState(initialTickets);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const filteredTickets = tickets.filter((ticket) =>
    ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredTickets.length / OPERATIONAL_PAGE_SIZE)));
  const pageTickets = filteredTickets.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setLoadingId(id);
    try {
      const result = await updateTicketStatus(id, newStatus);
      if (result.success) setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, status: newStatus } : ticket));
      else alert(result.error);
    } catch {
      alert("Não foi possível atualizar o chamado. Tente novamente.");
    } finally {
      setLoadingId(null);
    }
  };

  return <OperationalTablePanel title="Fila de Chamados Recentes" triggerLabel="Consultar chamados recentes">
    <OperationalListFrame label="Fila de chamados recentes"
      toolbar={<input type="search" aria-label="Buscar chamado por número ou assunto" placeholder="Buscar chamado..." className={styles.searchInput} value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} />}
      pagination={<OperationalPagination page={activePage} total={filteredTickets.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="atendimento-chamados-legado" caption="Fila de chamados recentes" emptyMessage={tickets.length ? "Nenhum chamado encontrado na busca." : "Nenhum chamado pendente. A caixa de entrada de serviços rápidos está vazia no momento."}
        rows={pageTickets.map((ticket) => ({
          id: ticket.id, label: ticket.ticketNumber,
          values: { number: ticket.ticketNumber, subject: ticket.subject, description: ticket.description, channel: ticket.channel.name, requester: ticket.person?.fullName || "Anônimo", date: new Date(ticket.createdAt).toLocaleString("pt-BR"), priority: ticket.priority, status: ticket.status },
          actions: <div className={styles.rowActions}>
            {ticket.status === "Aberto" && <button type="button" onClick={() => void handleStatusChange(ticket.id, "Em Atendimento")} disabled={loadingId === ticket.id} className={styles.iconButton} aria-label={`Atender chamado ${ticket.ticketNumber}`} title="Atender"><PlayCircle /></button>}
            {ticket.status === "Em Atendimento" && <button type="button" onClick={() => void handleStatusChange(ticket.id, "Resolvido")} disabled={loadingId === ticket.id} className={styles.iconButton} aria-label={`Concluir chamado ${ticket.ticketNumber}`} title="Concluir"><CheckCircle2 /></button>}
            {ticket.status === "Resolvido" && <span className="text-emerald-700">Finalizado</span>}
          </div>,
        }))} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
