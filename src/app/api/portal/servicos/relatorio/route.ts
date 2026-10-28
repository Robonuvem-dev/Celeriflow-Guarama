import { z } from "zod";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { portalServiceRequests } from "@/db/schema/portal-services";
import { processes } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { infrastructureServices } from "@/db/schema/infrastructure";
import { portalApiError } from "@/lib/portal-cidadao/api-access";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await getProtocolContext(), params = new URL(request.url).searchParams;
    const input = z.object({ start: z.iso.date().optional(), end: z.iso.date().optional(), status: z.string().max(80).optional(), executed: z.enum(["1", "0"]).default("0") }).parse(Object.fromEntries(params));
    if (input.start && input.end && input.start > input.end) throw new Error("Período inválido.");
    const dateColumn = input.executed === "1" ? infrastructureServices.completedAt : portalServiceRequests.createdAt;
    const rows = await db.select({ status: portalServiceRequests.status, createdAt: portalServiceRequests.createdAt, snapshot: portalServiceRequests.snapshot, protocolNumber: processes.protocolNumber, department: { name: departments.name }, worksService: { completedAt: infrastructureServices.completedAt } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).leftJoin(infrastructureServices, eq(infrastructureServices.id, portalServiceRequests.worksServiceId)).where(and(protocolScopeCondition(context), input.status ? eq(portalServiceRequests.status, input.status) : undefined, input.executed === "1" ? eq(infrastructureServices.status, "Concluído") : undefined, input.start ? gte(dateColumn, new Date(`${input.start}T00:00:00Z`)) : undefined, input.end ? lt(dateColumn, new Date(new Date(`${input.end}T00:00:00Z`).getTime() + 86400000)) : undefined)).orderBy(asc(portalServiceRequests.createdAt), asc(portalServiceRequests.id));
    const items = rows.map(row => ({ ...row, process: { protocolNumber: row.protocolNumber, currentDepartment: row.department } }));
    return new Response(await serviceReportPdf(input.executed === "1" ? "Serviços executados" : "Ocorrências e solicitações", [`Período: ${input.start || "início"} a ${input.end || "atual"}`, `Total: ${items.length}`, ...items.map((item) => `${item.process.protocolNumber} | ${(item.snapshot as { name: string }).name} | ${item.status} | abertura ${item.createdAt.toLocaleDateString("pt-BR")} | setor ${item.process.currentDepartment?.name || "Não atribuído"}${item.worksService?.completedAt ? ` | execução ${item.worksService.completedAt.toLocaleDateString("pt-BR")}` : ""}`)]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="relatorio-servicos.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
