import { z } from "zod";
import { getProtocolContext, protocolScope } from "@/lib/protocols/access";
import { portalApiError } from "@/lib/portal-cidadao/api-access";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await getProtocolContext(), params = new URL(request.url).searchParams;
    const input = z.object({ start: z.iso.date().optional(), end: z.iso.date().optional(), status: z.string().max(80).optional(), executed: z.enum(["1", "0"]).default("0") }).parse(Object.fromEntries(params));
    if (input.start && input.end && input.start > input.end) throw new Error("Período inválido.");
    const items = await context.prisma.portalServiceRequest.findMany({ where: { process: protocolScope(context), ...(input.status ? { status: input.status } : {}), ...(input.executed === "1" ? { worksService: { status: "Concluído", completedAt: { ...(input.start ? { gte: new Date(`${input.start}T00:00:00Z`) } : {}), ...(input.end ? { lt: new Date(new Date(`${input.end}T00:00:00Z`).getTime() + 86400000) } : {}) } } } : { createdAt: { ...(input.start ? { gte: new Date(`${input.start}T00:00:00Z`) } : {}), ...(input.end ? { lt: new Date(new Date(`${input.end}T00:00:00Z`).getTime() + 86400000) } : {}) } }) }, select: { status: true, createdAt: true, snapshot: true, process: { select: { protocolNumber: true, currentDepartment: { select: { name: true } } } }, worksService: { select: { completedAt: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return new Response(await serviceReportPdf(input.executed === "1" ? "Serviços executados" : "Ocorrências e solicitações", [`Período: ${input.start || "início"} a ${input.end || "atual"}`, `Total: ${items.length}`, ...items.map((item) => `${item.process.protocolNumber} | ${(item.snapshot as { name: string }).name} | ${item.status} | abertura ${item.createdAt.toLocaleDateString("pt-BR")} | setor ${item.process.currentDepartment?.name || "Não atribuído"}${item.worksService?.completedAt ? ` | execução ${item.worksService.completedAt.toLocaleDateString("pt-BR")}` : ""}`)]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="relatorio-servicos.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
