import { getProtocolContext, protocolScope } from "@/lib/protocols/access";
import { portalApiError } from "@/lib/portal-cidadao/api-access";
import { AccessError } from "@/lib/platform/tenant-context";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getProtocolContext(), { id } = await params;
    const schedule = await context.prisma.portalServiceSchedule.findUniqueOrThrow({ where: { id }, include: { links: { include: { request: { include: { process: { select: { protocolNumber: true } } } } } } } });
    const allowed = await context.prisma.portalServiceRequest.count({ where: { id: { in: schedule.links.map((item) => item.requestId) }, process: protocolScope(context) } });
    if (allowed !== schedule.links.length) throw new AccessError("Programação fora do escopo autorizado.", 403);
    const employee = schedule.employeeId ? await context.prisma.employee.findUnique({ where: { id: schedule.employeeId }, select: { name: true } }) : null;
    const team = schedule.teamId ? await context.prisma.obrasEquipe.findUnique({ where: { id: schedule.teamId }, select: { name: true } }) : null;
    const equipment = schedule.assetId ? await context.prisma.asset.findUnique({ where: { id: schedule.assetId }, select: { description: true } }) : null;
    const lines = [`Programação/ordem: ${schedule.id}`, `Tipo: ${schedule.type} - situação: ${schedule.status}`, `Início: ${schedule.startsAt.toLocaleString("pt-BR")}`, `Término: ${schedule.endsAt.toLocaleString("pt-BR")}`, `Recurso: ${schedule.resourceKey}`, `Executor: ${employee?.name || "Não atribuído"}`, `Equipe: ${team?.name || "Não atribuída"}`, `Equipamento: ${equipment?.description || "Não atribuído"}`, `Motivo: ${schedule.reason}`, `Mão de obra: prevista ${schedule.laborQuantity}, realizada ${schedule.realizedQuantity}, custo unitário ${schedule.laborUnitCost}`, ...schedule.links.flatMap(({ request }) => [`Protocolo: ${request.process.protocolNumber}`, `Serviço: ${(request.snapshot as { name: string }).name}`, `Local: ${(request.payload as { location: string }).location || "Não informado"}`, `Solicitação: ${(request.payload as { description: string }).description}`])];
    return new Response(await serviceReportPdf("Programação e ordem de serviço", lines), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="programacao-servicos.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
