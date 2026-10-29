import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { and, asc, count, eq, gte, ilike, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets as ticketTable, supportChannels } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";
import { ticketScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { listAttendanceTickets } from "@/db/repositories/attendance-portals/queries";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getAttendanceContext } from "@/lib/attendance/access";

export const dynamic = "force-dynamic";
const columns: OperationalColumn[] = [
  { key: "protocol", label: "Protocolo", type: "identifier", initialWidth: 160, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "requester", label: "Solicitante", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "subject", label: "Assunto", type: "text", initialWidth: 260, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "channel", label: "Canal", type: "text", initialWidth: 130, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Abertura", type: "text", initialWidth: 110, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "assignee", label: "Responsável", type: "text", initialWidth: 180, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 150, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 70, minWidth: 60, maxWidth: 85, resizable: false, sortable: false, details: "none" },
];

export default async function CentralDemandasPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; priority?: string; channelId?: string; departmentId?: string; overdue?: string; deadline?: string; page?: string }> }) {
  const { q = "", status = "", priority = "", channelId = "", departmentId = "", overdue = "", deadline = "", page: pageParam = "1" } = await searchParams;
  const requestedPage = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const context = await getAttendanceContext();
  const search = q.trim();
  const now = new Date();
  const deadlineWarning = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const filters: (SQL | undefined)[] = [ticketScopeCondition(context)];
  if (status) filters.push(eq(ticketTable.status, status));
  if (priority) filters.push(eq(ticketTable.priority, priority));
  if (channelId) filters.push(eq(ticketTable.channelId, channelId));
  if (departmentId && context.attendanceAccess.isManager) filters.push(eq(ticketTable.departmentId, departmentId));
  if (overdue === "1") filters.push(and(lt(ticketTable.dueAt, now), notInArray(ticketTable.status, ["Concluído", "Cancelado"])));
  if (deadline === "upcoming") filters.push(and(gte(ticketTable.dueAt, now), lte(ticketTable.dueAt, deadlineWarning), notInArray(ticketTable.status, ["Concluído", "Cancelado"])));
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(or(ilike(ticketTable.ticketNumber, pattern), ilike(ticketTable.subject, pattern), sql`EXISTS(SELECT 1 FROM "Person" p WHERE p.id=${ticketTable.personId} AND p."fullName" ILIKE ${pattern})`, sql`EXISTS(SELECT 1 FROM "Company" c WHERE c.id=${ticketTable.companyId} AND c."corporateName" ILIKE ${pattern})`));
  }
  const where = and(...filters);
  const [{ total }] = await db.select({ total: count() }).from(ticketTable).where(where);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const [tickets, channels, departments] = await Promise.all([
    listAttendanceTickets(db, where, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, order: "deadline-updated" }),
    db.select({ id: supportChannels.id, name: supportChannels.name }).from(supportChannels).where(eq(supportChannels.isActive, true)).orderBy(asc(supportChannels.name)),
    context.attendanceAccess.isManager ? db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)) : [],
  ]);
  const values = { q, status, priority, channelId, departmentId: context.attendanceAccess.isManager ? departmentId : "", overdue, deadline };
  return <OperationalListFrame label="Central de Demandas"
    actions={<Link href="/atendimento/novo" className={styles.newButton}>Novo atendimento</Link>}
    toolbar={<>
      <form method="get" className={styles.searchForm}>
        {Object.entries(values).filter(([key, value]) => key !== "q" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <input name="q" defaultValue={q} aria-label="Buscar demandas" placeholder="Protocolo, assunto ou solicitante" className={styles.searchInput} />
        <button className={styles.filterButton}>Buscar</button>
      </form>
      <OperationalFilters activeCount={Object.entries(values).filter(([key, value]) => key !== "q" && value).length}>
        <form method="get" className={styles.filterFields}>
          <input type="hidden" name="q" value={q} />
          <label>Situação<select name="status" defaultValue={status}><option value="">Todos os status</option>{["Aberto", "Encaminhado", "Aguardando Recebimento", "Em Atendimento", "Aguardando Informação", "Resolvido", "Concluído", "Cancelado", "Reaberto"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Prioridade<select name="priority" defaultValue={priority}><option value="">Prioridades</option>{["Baixa", "Normal", "Alta", "Urgente"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Canal<select name="channelId" defaultValue={channelId}><option value="">Canais</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
          {context.attendanceAccess.isManager && <label>Setor<select name="departmentId" defaultValue={departmentId}><option value="">Setores</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
          <label><input type="checkbox" name="overdue" value="1" defaultChecked={overdue === "1"} />Atrasados</label>
          <label>Prazo<select name="deadline" defaultValue={deadline}><option value="">Todos</option><option value="upcoming">Próximas 48 horas</option></select></label>
          <button className={styles.dialogButton}>Aplicar filtros</button><Link href="/atendimento/central" className={styles.dialogButton}>Limpar</Link>
        </form>
      </OperationalFilters>
    </>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/atendimento/central" values={values} />}>
    <OperationalTable columns={columns} preferenceId="atendimento-central" caption="Central de demandas" emptyMessage="Nenhuma demanda encontrada." rows={tickets.map((ticket) => ({
      id: ticket.id, label: ticket.ticketNumber,
      values: { protocol: ticket.ticketNumber, requester: ticket.isAnonymous ? "Anônimo" : ticket.person?.fullName || ticket.company?.tradeName || ticket.company?.corporateName || "Não informado", subject: ticket.subject, channel: ticket.channel.name, date: ticket.createdAt.toLocaleDateString("pt-BR"), assignee: ticket.assignee?.name || ticket.department?.name || "Sem responsável", status: ticket.status },
      actions: <div className={styles.rowActions}><Link className={styles.iconButton} href={`/atendimento/chamados/${ticket.id}`} aria-label={`Abrir demanda ${ticket.ticketNumber}`} title="Abrir demanda"><ExternalLink /></Link></div>,
    }))} />
  </OperationalListFrame>;
}
