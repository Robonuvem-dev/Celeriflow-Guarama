import { and, asc, count, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets, ombudsmans, supportChannels } from "@/db/schema/attendance-portals";
import { departments as departmentTable, employees as employeeTable } from "@/db/schema/administration";
import { ticketScopeCondition, ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { getAttendanceContext } from "@/lib/attendance/access";
import { exportSimpleTable, type SimpleTabularFormat } from "@/lib/reports/simple-tabular-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FORMATS: SimpleTabularFormat[] = ["pdf", "xlsx", "xls", "docx", "doc", "csv", "txt"];

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const rawFormat = (params.get("format") || "pdf").toLowerCase();
  if (!ALLOWED_FORMATS.includes(rawFormat as SimpleTabularFormat)) {
    return new Response("Formato de exportação inválido.", { status: 400 });
  }
  const format = rawFormat as SimpleTabularFormat;
  const start = params.get("start") || "";
  const end = params.get("end") || "";
  const departmentId = params.get("departmentId") || "";
  const section = params.get("section") || "completo";

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

  const complaintWhere = and(ombudsmanWhere, eq(ombudsmans.type, "Reclamação"));
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
    complaintSectors,
    complaintTeams,
    complaintProfessionals,
    departments,
    employees,
    channels,
  ] = await Promise.all([
    db.select({ status: tickets.status, total: count() }).from(tickets).where(ticketsWhere).groupBy(tickets.status).orderBy(desc(count(tickets.status))),
    db.select({ departmentId: tickets.departmentId, total: count() }).from(tickets).where(ticketsWhere).groupBy(tickets.departmentId).orderBy(desc(count(tickets.departmentId))),
    db.select({ channelId: tickets.channelId, total: count() }).from(tickets).where(ticketsWhere).groupBy(tickets.channelId).orderBy(desc(count(tickets.channelId))),
    db.select({ priority: tickets.priority, total: count() }).from(tickets).where(ticketsWhere).groupBy(tickets.priority).orderBy(desc(count(tickets.priority))),
    db.select({ resolvedById: tickets.resolvedById, total: count() }).from(tickets).where(and(ticketsWhere, isNotNull(tickets.resolvedAt))).groupBy(tickets.resolvedById).orderBy(desc(count(tickets.resolvedById))),
    db.select({ createdAt: tickets.createdAt, dueAt: tickets.dueAt, resolvedAt: tickets.resolvedAt, concludedAt: tickets.concludedAt }).from(tickets).where(ticketsWhere),
    db.select({ type: ombudsmans.type, total: count() }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.type).orderBy(desc(count(ombudsmans.type))),
    db.select({ status: ombudsmans.status, total: count() }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.status).orderBy(desc(count(ombudsmans.status))),
    db.select({ departmentId: ombudsmans.departmentId, total: count() }).from(ombudsmans).where(ombudsmanWhere).groupBy(ombudsmans.departmentId).orderBy(desc(count(ombudsmans.departmentId))),
    db.select({ concludedById: ombudsmans.concludedById, total: count() }).from(ombudsmans).where(and(ombudsmanWhere, isNotNull(ombudsmans.concludedAt))).groupBy(ombudsmans.concludedById).orderBy(desc(count(ombudsmans.concludedById))),
    db.select({ createdAt: ombudsmans.createdAt, concludedAt: ombudsmans.concludedAt }).from(ombudsmans).where(ombudsmanWhere),
    db.select({ name: departmentTable.name, total: count() }).from(ombudsmans).leftJoin(departmentTable, eq(departmentTable.id, ombudsmans.departmentId)).where(complaintWhere).groupBy(departmentTable.name).orderBy(desc(count())),
    db.select({ name: ombudsmans.complaintTeam, total: count() }).from(ombudsmans).where(complaintWhere).groupBy(ombudsmans.complaintTeam).orderBy(desc(count())),
    db.select({ name: employeeTable.name, total: count() }).from(ombudsmans).leftJoin(employeeTable, eq(employeeTable.id, ombudsmans.complaintProfessionalId)).where(complaintWhere).groupBy(employeeTable.name).orderBy(desc(count())),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
    db.select({ id: employeeTable.id, name: employeeTable.name }).from(employeeTable).where(eq(employeeTable.isActive, true)),
    db.select({ id: supportChannels.id, name: supportChannels.name }).from(supportChannels).where(eq(supportChannels.isActive, true)),
  ]);

  const departmentNames = new Map(departments.map((d) => [d.id, d.name]));
  const employeeNames = new Map(employees.map((e) => [e.id, e.name]));
  const channelNames = new Map(channels.map((c) => [c.id, c.name]));

  const openTicketDeadline = ticketDeadlines.filter((t) => t.dueAt && !t.concludedAt);
  const overdue = openTicketDeadline.filter((t) => t.dueAt! < now).length;
  const upcoming = openTicketDeadline.filter((t) => t.dueAt! >= now && t.dueAt! <= deadlineWarning).length;
  const completedOnTime = ticketDeadlines.filter((t) => t.dueAt && t.concludedAt && t.concludedAt <= t.dueAt!).length;
  const ticketAverage = averageHours(
    ticketDeadlines.map((t) => ({ createdAt: t.createdAt, completedAt: t.concludedAt || t.resolvedAt })),
  );
  const ombudsmanAverage = averageHours(
    ombudsmanCompletions.map((item) => ({ createdAt: item.createdAt, completedAt: item.concludedAt })),
  );
  const totalTickets = ticketStatus.reduce((acc, item) => acc + item.total, 0);
  const totalOmbudsman = ombudsmanStatus.reduce((acc, item) => acc + item.total, 0);

  const periodLabel =
    start || end
      ? `Período: ${start || "Início"} até ${end || "Hoje"}`
      : "Período: Todo o histórico autorizado";

  const rows: (string | number | null)[][] = [];

  if (section === "completo" || section === "atendimento") {
    rows.push(["Atendimento — Resumo Geral", "Total de Atendimentos", totalTickets, periodLabel]);
    rows.push(["Atendimento — Resumo Geral", "Atendimentos Atrasados", overdue, periodLabel]);
    rows.push(["Atendimento — Resumo Geral", "Próximos do Prazo (48h)", upcoming, periodLabel]);
    rows.push(["Atendimento — Resumo Geral", "Concluídos no Prazo", completedOnTime, periodLabel]);
    rows.push([
      "Atendimento — Resumo Geral",
      "Tempo Médio de Resolução (horas)",
      ticketAverage === null ? "N/A" : `${ticketAverage}h`,
      periodLabel,
    ]);

    for (const item of ticketStatus) {
      rows.push(["Atendimento por Status", item.status, item.total, periodLabel]);
    }
    for (const item of ticketChannels) {
      rows.push(["Atendimento por Canal", channelNames.get(item.channelId) || "Canal removido", item.total, periodLabel]);
    }
    for (const item of ticketPriorities) {
      rows.push(["Atendimento por Prioridade", item.priority, item.total, periodLabel]);
    }
    for (const item of ticketDepartments) {
      rows.push([
        "Atendimento por Setor",
        item.departmentId ? departmentNames.get(item.departmentId) || "Setor removido" : "Sem setor",
        item.total,
        periodLabel,
      ]);
    }
    for (const item of ticketResponsibles) {
      rows.push([
        "Produtividade por Responsável (Atendimento)",
        item.resolvedById ? employeeNames.get(item.resolvedById) || "Servidor removido" : "Sem responsável registrado",
        item.total,
        periodLabel,
      ]);
    }
  }

  if (section === "completo" || section === "ouvidoria") {
    rows.push(["Ouvidoria — Resumo Geral", "Total de Manifestações", totalOmbudsman, periodLabel]);
    rows.push([
      "Ouvidoria — Resumo Geral",
      "Manifestações em Apuração",
      ombudsmanStatus.find((row) => row.status === "Em Apuração")?.total || 0,
      periodLabel,
    ]);
    rows.push([
      "Ouvidoria — Resumo Geral",
      "Tempo Médio até Conclusão (horas)",
      ombudsmanAverage === null ? "N/A" : `${ombudsmanAverage}h`,
      periodLabel,
    ]);

    for (const item of ombudsmanTypes) {
      rows.push(["Ouvidoria por Tipo", item.type, item.total, periodLabel]);
    }
    for (const item of ombudsmanStatus) {
      rows.push(["Ouvidoria por Status", item.status, item.total, periodLabel]);
    }
    for (const item of ombudsmanDepartments) {
      rows.push([
        "Ouvidoria por Setor",
        item.departmentId ? departmentNames.get(item.departmentId) || "Setor removido" : "Ouvidoria",
        item.total,
        periodLabel,
      ]);
    }
    for (const item of ombudsmanResponsibles) {
      rows.push([
        "Conclusões por Responsável (Ouvidoria)",
        item.concludedById ? employeeNames.get(item.concludedById) || "Servidor removido" : "Sem responsável registrado",
        item.total,
        periodLabel,
      ]);
    }
    for (const item of complaintSectors) {
      rows.push(["Reclamações por Setor", item.name || "Não informado", item.total, periodLabel]);
    }
    for (const item of complaintTeams) {
      rows.push(["Reclamações por Equipe", item.name || "Não informada", item.total, periodLabel]);
    }
    for (const item of complaintProfessionals) {
      rows.push(["Reclamações por Profissional", item.name || "Não informado", item.total, periodLabel]);
    }
  }

  const output = await exportSimpleTable(
    {
      title: "Relatório Operacional de Atendimento ao Cidadão e Ouvidoria",
      columns: ["Categoria / Indicador", "Classificação / Item", "Quantidade / Valor", "Filtro de Período"],
      rows,
    },
    format,
  );

  return new Response(typeof output.body === "string" ? output.body : new Uint8Array(output.body), {
    headers: {
      "Content-Type": output.contentType,
      "Content-Disposition": `attachment; filename="relatorio-atendimento-ouvidoria-${section}.${output.extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
