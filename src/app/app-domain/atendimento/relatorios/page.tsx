import Link from "next/link";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MessageSquareWarning,
} from "lucide-react";
import { getAttendanceContext } from "@/lib/attendance/access";
import { and, asc, count, desc, eq, gte, isNotNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets, ombudsmans, supportChannels } from "@/db/schema/attendance-portals";
import { departments as departmentTable, employees as employeeTable } from "@/db/schema/administration";
import { ticketScopeCondition, ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export const dynamic = "force-dynamic";

function reportDate(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function averageHours(rows: Array<{ createdAt: Date; completedAt: Date | null }>) {
  const completed = rows.filter((row) => row.completedAt);
  if (!completed.length) return null;
  return Math.round(
    completed.reduce((total, row) => total + (row.completedAt!.getTime() - row.createdAt.getTime()) / 3600000, 0) /
      completed.length,
  );
}

async function ComplaintBreakdown({ scope }: { scope: SQL | undefined }) {
  const where = and(scope, eq(ombudsmans.type, "Reclamação"));
  const [sectors, teams, professionals] = await Promise.all([
    db
      .select({ name: departmentTable.name, total: count() })
      .from(ombudsmans)
      .leftJoin(departmentTable, eq(departmentTable.id, ombudsmans.departmentId))
      .where(where)
      .groupBy(departmentTable.name)
      .orderBy(desc(count())),
    db
      .select({ name: ombudsmans.complaintTeam, total: count() })
      .from(ombudsmans)
      .where(where)
      .groupBy(ombudsmans.complaintTeam)
      .orderBy(desc(count())),
    db
      .select({ name: employeeTable.name, total: count() })
      .from(ombudsmans)
      .leftJoin(employeeTable, eq(employeeTable.id, ombudsmans.complaintProfessionalId))
      .where(where)
      .groupBy(employeeTable.name)
      .orderBy(desc(count())),
  ]);
  const groups = [
    { title: "Setor de atendimento", rows: sectors },
    { title: "Equipe reclamada", rows: teams },
    { title: "Profissional reclamado", rows: professionals },
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Reclamações por setor, equipe e profissional</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Setor atual de atendimento e equipe/profissional objeto da reclamação, classificados pela Ouvidoria conforme período e escopo selecionados.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map(({ title, rows }) => (
          <div key={title} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</h3>
            {rows.length ? (
              <div className="mt-2.5 divide-y divide-slate-200/70">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="truncate text-slate-700">{row.name || "Não informado"}</span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-900 shadow-2xs">
                      {row.total}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2.5 text-xs text-slate-500">Sem reclamações registradas no período.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const EXPORT_FORMATS = [
  { format: "pdf", label: "PDF", badge: "Documento A4", icon: FileText },
  { format: "xlsx", label: "Excel (XLSX)", badge: "Planilha moderna", icon: FileSpreadsheet },
  { format: "xls", label: "Excel (XLS)", badge: "Compatível", icon: FileSpreadsheet },
  { format: "docx", label: "Word (DOCX)", badge: "Editável", icon: FileText },
  { format: "doc", label: "Word (DOC)", badge: "Clássico", icon: FileText },
  { format: "csv", label: "CSV", badge: "Dados separados", icon: Download },
  { format: "txt", label: "TXT", badge: "Texto tabulado", icon: Download },
] as const;

export default async function AtendimentoReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; departmentId?: string }>;
}) {
  const { start = "", end = "", departmentId = "" } = await searchParams;
  const context = await getAttendanceContext();
  const startDate = reportDate(start);
  const endDate = reportDate(end, true);
  const ticketsWhere = and(
    ticketScopeCondition(context),
    startDate ? gte(tickets.createdAt, startDate) : undefined,
    endDate ? lt(tickets.createdAt, endDate) : undefined,
    context.attendanceAccess.isManager && departmentId ? eq(tickets.departmentId, departmentId) : undefined,
  );
  const ombudsmanWhere = and(
    ombudsmanScopeCondition(context),
    startDate ? gte(ombudsmans.createdAt, startDate) : undefined,
    endDate ? lt(ombudsmans.createdAt, endDate) : undefined,
    context.attendanceAccess.isManager && departmentId ? eq(ombudsmans.departmentId, departmentId) : undefined,
  );
  const now = new Date();
  const deadlineWarning = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const [
    ticketStatus,
    ticketDepartments,
    ticketChannels,
    ticketPriorities,
    ticketResponsibles,
    ticketDeadlines,
    ombudsmanTypes,
    ombudsmanStatus,
    ombudsmanDepartments,
    ombudsmanResponsibles,
    ombudsmanCompletions,
    departments,
    employees,
    channels,
  ] = await Promise.all([
    db.select({ status: tickets.status, _count: { _all: count() } }).from(tickets).where(ticketsWhere).groupBy(tickets.status).orderBy(desc(count(tickets.status))),
    db.select({ departmentId: tickets.departmentId, _count: { _all: count() } }).from(tickets).where(ticketsWhere).groupBy(tickets.departmentId).orderBy(desc(count(tickets.departmentId))),
    db.select({ channelId: tickets.channelId, _count: { _all: count() } }).from(tickets).where(ticketsWhere).groupBy(tickets.channelId).orderBy(desc(count(tickets.channelId))),
    db.select({ priority: tickets.priority, _count: { _all: count() } }).from(tickets).where(ticketsWhere).groupBy(tickets.priority).orderBy(desc(count(tickets.priority))),
    db.select({ resolvedById: tickets.resolvedById, _count: { _all: count() } }).from(tickets).where(and(ticketsWhere, isNotNull(tickets.resolvedAt))).groupBy(tickets.resolvedById).orderBy(desc(count(tickets.resolvedById))),
    db.select({ createdAt: tickets.createdAt, dueAt: tickets.dueAt, resolvedAt: tickets.resolvedAt, concludedAt: tickets.concludedAt }).from(tickets).where(ticketsWhere),
    db.select({ type: ombudsmans.type, _count: { _all: count() } }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.type).orderBy(desc(count(ombudsmans.type))),
    db.select({ status: ombudsmans.status, _count: { _all: count() } }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.status).orderBy(desc(count(ombudsmans.status))),
    db.select({ departmentId: ombudsmans.departmentId, _count: { _all: count() } }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.departmentId).orderBy(desc(count(ombudsmans.departmentId))),
    db.select({ concludedById: ombudsmans.concludedById, _count: { _all: count() } }).from(ombudsmans).where(and(ombudsmanWhere, isNotNull(ombudsmans.concludedAt))).groupBy(ombudsmans.concludedById).orderBy(desc(count(ombudsmans.concludedById))),
    db.select({ createdAt: ombudsmans.createdAt, concludedAt: ombudsmans.concludedAt }).from(ombudsmans).where(ombudsmanWhere),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
    db.select({ id: employeeTable.id, name: employeeTable.name }).from(employeeTable).where(eq(employeeTable.isActive, true)),
    db.select({ id: supportChannels.id, name: supportChannels.name }).from(supportChannels).where(eq(supportChannels.isActive, true)),
  ]);
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const openTicketDeadline = ticketDeadlines.filter((ticket) => ticket.dueAt && !ticket.concludedAt);
  const overdue = openTicketDeadline.filter((ticket) => ticket.dueAt! < now).length;
  const upcoming = openTicketDeadline.filter((ticket) => ticket.dueAt! >= now && ticket.dueAt! <= deadlineWarning).length;
  const completedOnTime = ticketDeadlines.filter(
    (ticket) => ticket.dueAt && ticket.concludedAt && ticket.concludedAt <= ticket.dueAt!,
  ).length;
  const ticketAverage = averageHours(
    ticketDeadlines.map((ticket) => ({ createdAt: ticket.createdAt, completedAt: ticket.concludedAt || ticket.resolvedAt })),
  );
  const ombudsmanAverage = averageHours(
    ombudsmanCompletions.map((item) => ({ createdAt: item.createdAt, completedAt: item.concludedAt })),
  );
  const totalTickets = ticketStatus.reduce((total, item) => total + item._count._all, 0);
  const totalOmbudsman = ombudsmanStatus.reduce((total, item) => total + item._count._all, 0);

  function buildExportHref(format: string, section = "completo") {
    const query = new URLSearchParams();
    query.set("format", format);
    query.set("section", section);
    if (start) query.set("start", start);
    if (end) query.set("end", end);
    if (departmentId) query.set("departmentId", departmentId);
    return `/atendimento/relatorios/exportar?${query.toString()}`;
  }

  const table = (title: string, rows: Array<[string, number]>) => (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">{title}</h2>
      <div className="divide-y divide-slate-100">
        {rows.length ? (
          rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-slate-600">{label}</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-900">{value}</span>
            </div>
          ))
        ) : (
          <p className="px-5 py-6 text-xs text-slate-500">Sem dados no período e escopo selecionados.</p>
        )}
      </div>
    </section>
  );

  return (
    <PageFrame className="space-y-5 pb-6">
      <PageHeader
        title="Relatórios de Atendimento e Ouvidoria"
        icon={<BarChart3 className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/atendimento/ouvidoria"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ouvidoria
            </Link>
            <Link
              href="/atendimento"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0e4c7e] px-3.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
            >
              Voltar ao painel
            </Link>
          </div>
        }
      />

      {/* Filtros + Exportação Multiformato */}
      <div className="grid gap-4 lg:grid-cols-12">
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-7">
          <div className="w-full border-b border-slate-100 pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              <Filter className="h-3.5 w-3.5 text-[#0e4c7e]" />
              Filtros de Período e Setor
            </span>
          </div>
          <label className="field min-w-[140px] flex-1">
            <span>Data inicial</span>
            <input type="date" name="start" defaultValue={start} className="input" />
          </label>
          <label className="field min-w-[140px] flex-1">
            <span>Data final</span>
            <input type="date" name="end" defaultValue={end} className="input" />
          </label>
          {context.attendanceAccess.isManager && (
            <label className="field min-w-[200px] flex-1">
              <span>Setor autorizado</span>
              <select name="departmentId" defaultValue={departmentId} className="input">
                <option value="">Todos os setores autorizados</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0e4c7e] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#0b3d66]"
            >
              Aplicar filtros
            </button>
            <Link
              href="/atendimento/relatorios"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar
            </Link>
          </div>
        </form>

        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-5">
          <div className="border-b border-slate-100 pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">
              <Download className="h-3.5 w-3.5" />
              Exportar Relatório em Vários Formatos
            </span>
            <p className="mt-0.5 text-xs text-slate-500">
              Baixe os indicadores filtrados nos formatos oficiais de planilha, documento ou texto:
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
              <a
                key={format}
                href={buildExportHref(format, "completo")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#0e4c7e] hover:bg-[#0e4c7e]/5 hover:text-[#0e4c7e]"
                title={`Exportar relatório completo em formato ${label}`}
              >
                <Icon className="h-3.5 w-3.5 text-[#0e4c7e]" />
                {label}
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* Aviso LGPD */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs text-emerald-950 shadow-2xs">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <strong>Relatório protegido por sigilo e LGPD:</strong> dados de identidade, CPF, contatos, assunto e narrativa individual de manifestações não são expostos nas agregações estatísticas.
        </div>
      </div>

      {/* KPIs de Atendimento */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total de Atendimentos</span>
            <CheckCircle2 className="h-4 w-4 text-[#0e4c7e]" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalTickets}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-red-700">
            <span>Atrasados</span>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-red-700">{overdue}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
            <span>Próximos do prazo (48h)</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-amber-700">{upcoming}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Tempo médio de resolução</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{ticketAverage === null ? "-" : `${ticketAverage}h`}</p>
        </div>
      </div>

      <ComplaintBreakdown scope={ombudsmanWhere} />

      {/* Tabelas de Atendimento */}
      <div className="grid gap-4 lg:grid-cols-3">
        {table(
          "Atendimentos por status",
          ticketStatus.map((row) => [row.status, row._count._all]),
        )}
        {table(
          "Atendimentos por canal",
          ticketChannels.map((row) => [channelNames.get(row.channelId) || "Canal removido", row._count._all]),
        )}
        {table(
          "Atendimentos por prioridade",
          ticketPriorities.map((row) => [row.priority, row._count._all]),
        )}
        {table(
          "Atendimentos por setor",
          ticketDepartments.map((row) => [
            row.departmentId ? departmentNames.get(row.departmentId) || "Setor removido" : "Sem setor",
            row._count._all,
          ]),
        )}
        {table(
          "Produtividade por responsável",
          ticketResponsibles.map((row) => [
            row.resolvedById ? employeeNames.get(row.resolvedById) || "Servidor removido" : "Sem responsável registrado",
            row._count._all,
          ]),
        )}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">Conformidade de prazo</h2>
          <div className="divide-y divide-slate-100 px-5 py-2 text-sm text-slate-600">
            <div className="flex items-center justify-between py-2">
              <span>Com prazo definido</span>
              <strong className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-900">
                {ticketDeadlines.filter((ticket) => ticket.dueAt).length}
              </strong>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Concluídos no prazo</span>
              <strong className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {completedOnTime}
              </strong>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Sem prazo definido</span>
              <strong className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-900">
                {ticketDeadlines.filter((ticket) => !ticket.dueAt).length}
              </strong>
            </div>
          </div>
        </section>
      </div>

      {/* Seção Consolidada de Ouvidoria */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <MessageSquareWarning className="h-5 w-5 text-[#0e4c7e]" />
              Indicadores de Ouvidoria Municipal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Métricas agregadas de manifestações acessíveis no escopo atual.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Exportar somente Ouvidoria:</span>
            {(["pdf", "xlsx", "docx", "csv"] as const).map((fmt) => (
              <a
                key={fmt}
                href={buildExportHref(fmt, "ouvidoria")}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold uppercase text-slate-700 hover:border-[#0e4c7e] hover:text-[#0e4c7e]"
              >
                {fmt}
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500">Total de Manifestações</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalOmbudsman}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-xs font-semibold text-amber-800">Em apuração</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {ombudsmanStatus.find((row) => row.status === "Em Apuração")?._count._all || 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-500">Tempo médio até conclusão</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {ombudsmanAverage === null ? "-" : `${ombudsmanAverage}h`}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {table(
            "Manifestações por tipo",
            ombudsmanTypes.map((row) => [row.type, row._count._all]),
          )}
          {table(
            "Manifestações por status",
            ombudsmanStatus.map((row) => [row.status, row._count._all]),
          )}
          {table(
            "Manifestações por setor",
            ombudsmanDepartments.map((row) => [
              row.departmentId ? departmentNames.get(row.departmentId) || "Setor removido" : "Ouvidoria",
              row._count._all,
            ]),
          )}
          {table(
            "Conclusões por responsável",
            ombudsmanResponsibles.map((row) => [
              row.concludedById ? employeeNames.get(row.concludedById) || "Servidor removido" : "Sem responsável registrado",
              row._count._all,
            ]),
          )}
        </div>
      </section>
    </PageFrame>
  );
}
