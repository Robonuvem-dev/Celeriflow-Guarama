import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, count, eq, inArray } from "drizzle-orm";
import { portalServiceSchedules, portalScheduleRequests, portalServiceRequests } from "@/db/schema/portal-services";
import { processes } from "@/db/schema/processes";
import { employees } from "@/db/schema/administration";
import { infrastructureTeams } from "@/db/schema/infrastructure";
import { assets } from "@/db/schema/assets";
import { portalApiError } from "@/lib/portal-cidadao/api-access";
import { AccessError } from "@/lib/platform/tenant-context";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getProtocolContext(), { id } = await params;
    const [scheduleRow] = await db.select().from(portalServiceSchedules).where(eq(portalServiceSchedules.id, id)).limit(1);
    if (!scheduleRow) throw new AccessError("Programação não encontrada.", 404);
    const links = await db.select({ requestId: portalScheduleRequests.requestId, request: portalServiceRequests, process: { protocolNumber: processes.protocolNumber } }).from(portalScheduleRequests).innerJoin(portalServiceRequests, eq(portalServiceRequests.id, portalScheduleRequests.requestId)).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(eq(portalScheduleRequests.scheduleId, id));
    const schedule = { ...scheduleRow, links: links.map(link => ({ requestId: link.requestId, request: { ...link.request, process: link.process } })) };
    const [{ total: allowed }] = await db.select({ total: count() }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(and(inArray(portalServiceRequests.id, schedule.links.map(item => item.requestId)), protocolScopeCondition(context)));
    if (allowed !== schedule.links.length) throw new AccessError("Programação fora do escopo autorizado.", 403);
    const employee = schedule.employeeId ? (await db.select({ name: employees.name }).from(employees).where(eq(employees.id, schedule.employeeId)).limit(1))[0] : null;
    const team = schedule.teamId ? (await db.select({ name: infrastructureTeams.name }).from(infrastructureTeams).where(eq(infrastructureTeams.id, schedule.teamId)).limit(1))[0] : null;
    const equipment = schedule.assetId ? (await db.select({ description: assets.description }).from(assets).where(eq(assets.id, schedule.assetId)).limit(1))[0] : null;
    const lines = [`Programação/ordem: ${schedule.id}`, `Tipo: ${schedule.type} - situação: ${schedule.status}`, `Início: ${schedule.startsAt.toLocaleString("pt-BR")}`, `Término: ${schedule.endsAt.toLocaleString("pt-BR")}`, `Recurso: ${schedule.resourceKey}`, `Executor: ${employee?.name || "Não atribuído"}`, `Equipe: ${team?.name || "Não atribuída"}`, `Equipamento: ${equipment?.description || "Não atribuído"}`, `Motivo: ${schedule.reason}`, `Mão de obra: prevista ${schedule.laborQuantity}, realizada ${schedule.realizedQuantity}, custo unitário ${schedule.laborUnitCost}`, ...schedule.links.flatMap(({ request }) => [`Protocolo: ${request.process.protocolNumber}`, `Serviço: ${(request.snapshot as { name: string }).name}`, `Local: ${(request.payload as { location: string }).location || "Não informado"}`, `Solicitação: ${(request.payload as { description: string }).description}`])];
    return new Response(await serviceReportPdf("Programação e ordem de serviço", lines), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="programacao-servicos.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
