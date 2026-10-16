import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { buildFleetControlReport } from "@/lib/frotas/control-report";
import { FleetControlError } from "@/lib/frotas/control-access";
import { renderFleetPdf } from "@/lib/frotas/report";
import { createDefaultReportTemplate } from "@/lib/reports/report-template";
import { renderTabularCsv, renderTabularPrintHtml, renderTabularTxt, renderTabularXlsx } from "@/lib/reports/tabular-renderers";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("FROTAS", "issueReports"), query = new URL(request.url).searchParams;
    const format = z.enum(["pdf", "xlsx", "csv", "txt", "print"]).parse(query.get("format") || "pdf"), documentType = z.enum(["authorization", "trip", "blankFuel", "blankTrip"]).optional().parse(query.get("documentType") || undefined);
    const unitIds = query.get("unitIds")?.split(",").filter(Boolean); if (unitIds && (unitIds.length > 1000 || unitIds.some((id) => !/^[a-zA-Z0-9_-]{1,100}$/.test(id)))) throw new FleetControlError("Selecione até mil unidades válidas.");
    const dataset = await buildFleetControlReport(context, { query: Object.fromEntries(query), documentType, documentId: query.get("documentId") || undefined, unitIds });
    const institution = await context.prisma.institution.findFirst({ select: { name: true, legalName: true, cnpj: true, address: true, city: true, state: true } }), presentation = { institution, template: createDefaultReportTemplate(), emission: { issuedAt: new Date().toISOString(), issuedBy: context.user.name } };
    let body: string | Uint8Array, contentType: string;
    if (format === "pdf") { body = await renderFleetPdf(dataset, presentation); contentType = "application/pdf"; }
    else if (format === "xlsx") { body = await renderTabularXlsx(dataset, presentation); contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; }
    else if (format === "csv") { body = "\uFEFF" + renderTabularCsv(dataset, presentation); contentType = "text/csv; charset=utf-8"; }
    else if (format === "txt") { body = renderTabularTxt(dataset, presentation); contentType = "text/plain; charset=utf-8"; }
    else { body = renderTabularPrintHtml(dataset, presentation); contentType = "text/html; charset=utf-8"; }
    await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "FLEET_CONTROL_REPORT", targetId: documentType || "FLEET_CONTROL" });
    return new Response(typeof body === "string" ? body : new Blob([body as Uint8Array<ArrayBuffer>]), { headers: { "Content-Type": contentType, "Content-Disposition": `${format === "print" ? "inline" : "attachment"}; filename="frota-${documentType || "controle"}.${format === "print" ? "html" : format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof FleetControlError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof z.ZodError) return Response.json({ error: "Filtros ou formato do relatório inválidos." }, { status: 400 });
    console.error("[frotas] Falha ao emitir relatório de controle", error);
    return Response.json({ error: "Relatório não disponível." }, { status: 500 });
  }
}
