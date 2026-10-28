import { AlertTriangle, CheckCircle2, Clock3, Headphones, Timer } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getAttendanceContext } from "@/lib/attendance/access";
import { and, count, desc, eq, gte, inArray, lt, lte, ne, notInArray, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets as ticketTable, ombudsmans, supportChannels } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";
import { ticketScopeCondition, ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { listAttendanceTickets } from "@/db/repositories/attendance-portals/queries";

export const dynamic = "force-dynamic";

export default async function AtendimentoDashboardPage() {
  const context = await getAttendanceContext();
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const deadlineWarning = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const activeTicketStatuses = notInArray(ticketTable.status, ["Concluído", "Cancelado"]);
  const ticketScope = ticketScopeCondition(context), ombudsmanScope = ombudsmanScopeCondition(context);
  const countTickets = (condition: SQL | undefined) => db.select({ total: count() }).from(ticketTable).where(and(ticketScope, condition)).then(rows => rows[0].total);
  const countOmbudsman = (condition: SQL | undefined) => db.select({ total: count() }).from(ombudsmans).where(and(ombudsmanScope, condition)).then(rows => rows[0].total);
  const [openedToday, inProgressTicketsCount, awaitingInformationCount, resolvedTicketsCount, overdueTicketsCount, upcomingTicketsCount, pendingOmbudsmanCount, investigatingOmbudsmanCount, concludedOmbudsmanCount, ombudsmanTypes, ticketsByDepartment, ticketsByChannel, ticketsByPriority, tickets] = await Promise.all([
    countTickets(gte(ticketTable.createdAt, today)),
    countTickets(eq(ticketTable.status, "Em Atendimento")),
    countTickets(eq(ticketTable.status, "Aguardando Informação")),
    countTickets(eq(ticketTable.status, "Resolvido")),
    countTickets(and(lt(ticketTable.dueAt, now), activeTicketStatuses)),
    countTickets(and(gte(ticketTable.dueAt, now), lte(ticketTable.dueAt, deadlineWarning), activeTicketStatuses)),
    countOmbudsman(ne(ombudsmans.status, "Concluída")),
    countOmbudsman(eq(ombudsmans.status, "Em Apuração")),
    countOmbudsman(eq(ombudsmans.status, "Concluída")),
    db.select({ type: ombudsmans.type, _count: { _all: count() } }).from(ombudsmans).where(ombudsmanScope).groupBy(ombudsmans.type),
    db.select({ departmentId: ticketTable.departmentId, _count: { _all: count() } }).from(ticketTable).where(ticketScope).groupBy(ticketTable.departmentId).orderBy(desc(count(ticketTable.departmentId))).limit(5),
    db.select({ channelId: ticketTable.channelId, _count: { _all: count() } }).from(ticketTable).where(ticketScope).groupBy(ticketTable.channelId).orderBy(desc(count(ticketTable.channelId))).limit(5),
    db.select({ priority: ticketTable.priority, _count: { _all: count() } }).from(ticketTable).where(ticketScope).groupBy(ticketTable.priority).orderBy(desc(count(ticketTable.priority))),
    listAttendanceTickets(db, ticketScope, { limit: 8, order: "recent" }),
  ]);
  const departmentIds = ticketsByDepartment.flatMap((row) => row.departmentId ? [row.departmentId] : []);
  const channelIds = ticketsByChannel.map((row) => row.channelId);
  const [departments, channels] = await Promise.all([
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(inArray(departmentTable.id, departmentIds)),
    db.select({ id: supportChannels.id, name: supportChannels.name }).from(supportChannels).where(inArray(supportChannels.id, channelIds)),
  ]);
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const typeCounts = new Map(ombudsmanTypes.map((row) => [row.type, row._count._all]));

  const stats = [
    { title: "Abertos hoje", value: openedToday.toString(), icon: Headphones, href: "/atendimento/central", color: "text-violet-600", bg: "bg-violet-100" },
    { title: "Em Atendimento", value: inProgressTicketsCount.toString(), icon: CheckCircle2, href: "/atendimento/fila?status=Em%20Atendimento", color: "text-blue-600", bg: "bg-blue-100" },
    { title: "Aguardando informação", value: awaitingInformationCount.toString(), icon: Clock3, href: "/atendimento/fila?status=Aguardando%20Informa%C3%A7%C3%A3o", color: "text-sky-600", bg: "bg-sky-100" },
    { title: "Resolvidos", value: resolvedTicketsCount.toString(), icon: CheckCircle2, href: "/atendimento/central?status=Resolvido", color: "text-emerald-600", bg: "bg-emerald-100" },
    { title: "Atrasados", value: overdueTicketsCount.toString(), icon: AlertTriangle, href: "/atendimento/central?overdue=1", color: "text-red-600", bg: "bg-red-100" },
    { title: "Próximos do prazo", value: upcomingTicketsCount.toString(), icon: Timer, href: "/atendimento/central?deadline=upcoming", color: "text-amber-600", bg: "bg-amber-100" },
  ];
  const table = (title: string, rows: Array<[string, number]>) => (
    <section className="rounded-md border border-slate-200 bg-white">
      <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">{title}</h2>
      <div className="divide-y divide-slate-100">
        {rows.length ? rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-slate-600">{label}</span>
            <span className="font-semibold text-slate-900">{value}</span>
          </div>
        )) : <p className="px-3 py-4 text-sm text-slate-500">Sem dados no escopo autorizado.</p>}
      </div>
    </section>
  );

  return (
    <PageFrame className="space-y-2">
      <PageHeader
        title="Painel de Atendimento"
        icon={<Headphones className="size-4 shrink-0 text-violet-600" />}
        action={(
          <Link href="/atendimento/novo" aria-label="Novo Chamado Rápido" className="inline-flex h-7 items-center rounded-md bg-violet-600 px-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700">
            <span className="hidden sm:inline">Novo Chamado Rápido</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        )}
      />

       <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
         {stats.map((stat) => (
           <Link key={stat.title} href={stat.href} className="block group">
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                <p className="mt-0.5 text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
              <div className={`flex size-9 items-center justify-center rounded-md ${stat.bg} ${stat.color} transition-transform duration-200 group-hover:scale-105`}>
                <stat.icon className="size-5" strokeWidth={2.5} />
              </div>
            </div>
          </Link>
        ))}
       </div>

       <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
         <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-amber-950">Ouvidoria</h2><p className="mt-0.5 text-xs text-amber-800">Indicadores agregados, sem identidade, contato ou narrativa de manifestantes.</p></div><Link href="/atendimento/ouvidoria" className="text-xs font-semibold text-amber-800">Ver manifestações</Link></div>
         <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-md bg-white p-3"><p className="text-sm text-slate-500">Manifestações Pendentes</p><p className="mt-0.5 text-xl font-bold text-slate-900">{pendingOmbudsmanCount}</p></div><div className="rounded-md bg-white p-3"><p className="text-sm text-slate-500">Em apuração</p><p className="mt-0.5 text-xl font-bold text-slate-900">{investigatingOmbudsmanCount}</p></div><div className="rounded-md bg-white p-3"><p className="text-sm text-slate-500">Concluídas</p><p className="mt-0.5 text-xl font-bold text-slate-900">{concludedOmbudsmanCount}</p></div></div>
         <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{["Denúncia", "Reclamação", "Sugestão", "Elogio"].map((type) => <div key={type} className="rounded-md border border-amber-100 bg-white px-3 py-2 text-sm"><span className="text-slate-600">{type}</span><strong className="float-right text-slate-900">{typeCounts.get(type) || 0}</strong></div>)}</div>
       </section>

       <div className="grid gap-2 lg:grid-cols-3">{table("Atendimentos por setor", ticketsByDepartment.map((row) => [row.departmentId ? departmentNames.get(row.departmentId) || "Setor removido" : "Sem setor", row._count._all]))}{table("Atendimentos por canal", ticketsByChannel.map((row) => [channelNames.get(row.channelId) || "Canal removido", row._count._all]))}{table("Atendimentos por prioridade", ticketsByPriority.map((row) => [row.priority, row._count._all]))}</div>

         <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
           <div className="flex justify-between border-b p-3"><h2 className="text-sm font-semibold">Chamados recentes</h2><Link href="/atendimento/central" className="text-xs font-semibold text-violet-700">Ver central</Link></div>
           <div className="divide-y">{tickets.map((ticket) => <Link key={ticket.id} href={`/atendimento/chamados/${ticket.id}`} className="block p-3 hover:bg-slate-50"><strong>{ticket.ticketNumber}</strong><span className="ml-3">{ticket.subject}</span><small className="mt-0.5 block text-slate-500">{ticket.isAnonymous ? "Anônimo" : ticket.person?.fullName || ticket.company?.corporateName || "Não informado"} · {ticket.channel.name} · {ticket.status}</small></Link>)}{tickets.length === 0 && <p className="p-5 text-center text-slate-500">Nenhum chamado no escopo autorizado.</p>}</div>
        </div>
    </PageFrame>
  );
}
