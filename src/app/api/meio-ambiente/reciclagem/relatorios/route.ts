import { z } from "zod";
import { databaseConnection, db } from "@/db/client";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { parseRecyclingReportFilters, RecyclingReportError } from "@/lib/environment/recycling-reports";
import { readRecyclingReport } from "@/lib/environment/recycling-report-service";
import { recyclingReportDataset } from "@/lib/environment/recycling-report-delivery";
import { createDefaultReportTemplate } from "@/lib/reports/report-template";
import { renderTabularCsv, renderTabularPrintHtml, renderTabularXlsx } from "@/lib/reports/tabular-renderers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("MEIO_AMBIENTE", "issueReports");
    const query = new URL(request.url).searchParams;
    const format = z.enum(["csv", "xlsx", "print"]).parse(query.get("format") ?? "csv");
    const filters = parseRecyclingReportFilters(Object.fromEntries(query));
    const report = await readRecyclingReport(databaseConnection, filters, undefined, true);
    const dataset = recyclingReportDataset(report.data);
    const presentation = { institution: report.institution, template: createDefaultReportTemplate(), emission: { issuedAt: new Date().toISOString(), issuedBy: context.user.name } };
    let body: string | Uint8Array, contentType: string;
    if (format === "xlsx") { body = await renderTabularXlsx(dataset, presentation); contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; }
    else if (format === "print") { body = renderTabularPrintHtml(dataset, presentation); contentType = "text/html; charset=utf-8"; }
    else { body = "\uFEFF" + renderTabularCsv(dataset, presentation); contentType = "text/csv; charset=utf-8"; }
    await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "RecyclingReport", targetId: `${report.instanceId}:${filters.view}:${filters.from}:${filters.to}` });
    return new Response(typeof body === "string" ? body : new Blob([body as Uint8Array<ArrayBuffer>]), { headers: { "Content-Type": contentType, "Content-Disposition": `${format === "print" ? "inline" : "attachment"}; filename="reciclaveis-${filters.view}-${filters.from}-${filters.to}.${format === "print" ? "html" : format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (error instanceof AccessError || error instanceof RecyclingReportError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os filtros e o formato do relatório." }, { status: 400, headers });
    console.error("Falha ao emitir relatório de recicláveis", { name: error instanceof Error ? error.name : "Unknown" });
    return Response.json({ error: "Não foi possível emitir o relatório." }, { status: 500, headers });
  }
}
