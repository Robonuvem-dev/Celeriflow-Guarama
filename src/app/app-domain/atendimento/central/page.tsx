import Link from "next/link";
import { and, asc, count, eq, gte, ilike, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets as ticketTable, supportChannels } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";
import { ticketScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { listAttendanceTickets } from "@/db/repositories/attendance-portals/queries";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { ErpStatusBadge, ErpTableContainer, ErpTableTd, ErpTableTh, ErpTableThead, ErpTableTr } from "@/components/app-ui/erp/ErpTable";
import { getAttendanceContext } from "@/lib/attendance/access";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function CentralDemandasPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; priority?: string; channelId?: string; departmentId?: string; overdue?: string; deadline?: string; page?: string }> }) {
  const { q = "", status = "", priority = "", channelId = "", departmentId = "", overdue = "", deadline = "", page: pageParam = "1" } = await searchParams;
  const requestedPage = Math.max(1, Number(pageParam) || 1);
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
  const href = (targetPage: number) => {
    const params = new URLSearchParams(Object.entries({ ...values, page: String(targetPage) }).filter(([, value]) => value));
    return `/atendimento/central?${params}`;
  };

  return <PageFrame className="flex h-full min-h-0 flex-col">
    <PageHeader title="Central de Demandas" action={<Link href="/atendimento/novo" className="inline-flex h-7 items-center rounded bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800">Novo atendimento</Link>} />
    <ErpListFrame
      toolbar={<form className="grid grid-cols-2 gap-1.5 lg:flex lg:items-center">
        <input name="q" defaultValue={q} placeholder="Protocolo, assunto ou solicitante" className="col-span-2 h-7 min-w-0 flex-1 rounded border px-2.5 text-xs lg:max-w-sm" />
        <select name="status" defaultValue={status} className="h-7 min-w-0 rounded border px-2 text-xs"><option value="">Todos os status</option>{["Aberto", "Encaminhado", "Aguardando Recebimento", "Em Atendimento", "Aguardando Informação", "Resolvido", "Concluído", "Cancelado", "Reaberto"].map((value) => <option key={value}>{value}</option>)}</select>
        <select name="priority" defaultValue={priority} className="h-7 min-w-0 rounded border px-2 text-xs"><option value="">Prioridades</option>{["Baixa", "Normal", "Alta", "Urgente"].map((value) => <option key={value}>{value}</option>)}</select>
        <select name="channelId" defaultValue={channelId} className="h-7 min-w-0 rounded border px-2 text-xs"><option value="">Canais</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select>
        {context.attendanceAccess.isManager && <select name="departmentId" defaultValue={departmentId} className="h-7 min-w-0 rounded border px-2 text-xs"><option value="">Setores</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>}
        <label className="flex h-7 items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" name="overdue" value="1" defaultChecked={overdue === "1"} />Atrasados</label>
        <button className="h-7 rounded bg-slate-800 px-3 text-xs font-semibold text-white">Buscar</button>
        <Link href="/atendimento/central" className="inline-flex h-7 items-center justify-center rounded border px-3 text-xs">Limpar</Link>
      </form>}
      pagination={<ErpPagination page={page} total={total} pageSize={PAGE_SIZE} previousHref={href(page - 1)} nextHref={href(page + 1)} label="demandas" jumpTo={{ pathname: "/atendimento/central", values }} />}
    >
      <ErpTableContainer>
        <ErpTableThead><ErpTableTr>
          <ErpTableTh className="w-[14%]">Protocolo</ErpTableTh><ErpTableTh className="w-[19%]">Solicitante</ErpTableTh><ErpTableTh>Assunto</ErpTableTh><ErpTableTh className="hidden w-[12%] md:table-cell">Canal</ErpTableTh><ErpTableTh className="w-[11%]">Abertura</ErpTableTh><ErpTableTh className="hidden w-[15%] lg:table-cell">Responsável</ErpTableTh><ErpTableTh className="w-[12%]">Situação</ErpTableTh><ErpTableTh className="w-12 text-right">Ações</ErpTableTh>
        </ErpTableTr></ErpTableThead>
        <tbody>{tickets.map((ticket) => {
          const requester = ticket.isAnonymous ? "Anônimo" : ticket.person?.fullName || ticket.company?.tradeName || ticket.company?.corporateName || "Não informado";
          return <ErpTableTr key={ticket.id}>
            <ErpTableTd className="font-semibold" title={ticket.ticketNumber}>{ticket.ticketNumber}</ErpTableTd>
            <ErpTableTd title={requester}>{requester}</ErpTableTd>
            <ErpTableTd title={ticket.subject}>{ticket.subject}</ErpTableTd>
            <ErpTableTd className="hidden md:table-cell" title={ticket.channel.name}>{ticket.channel.name}</ErpTableTd>
            <ErpTableTd>{ticket.createdAt.toLocaleDateString("pt-BR")}</ErpTableTd>
            <ErpTableTd className="hidden lg:table-cell" title={ticket.assignee?.name || ticket.department?.name || "Sem responsável"}>{ticket.assignee?.name || ticket.department?.name || "Sem responsável"}</ErpTableTd>
            <ErpTableTd><ErpStatusBadge variant={ticket.status === "Concluído" ? "success" : ticket.status === "Cancelado" ? "danger" : "info"}>{ticket.status}</ErpStatusBadge></ErpTableTd>
            <ErpTableTd className="text-right"><Link className="font-semibold text-violet-700 hover:underline" href={`/atendimento/chamados/${ticket.id}`}>Abrir</Link></ErpTableTd>
          </ErpTableTr>;
        })}{tickets.length === 0 && <ErpTableTr><ErpTableTd colSpan={8} className="text-center text-slate-500">Nenhuma demanda encontrada.</ErpTableTd></ErpTableTr>}</tbody>
      </ErpTableContainer>
    </ErpListFrame>
  </PageFrame>;
}
