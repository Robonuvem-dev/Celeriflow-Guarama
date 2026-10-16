import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { healthBillingDocument } from "@/lib/saude/billing-document-service";
import { healthBillingPreview, healthPatientConsumptionCost } from "@/lib/saude/billing-report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports");
  const { tipo, formato, ...query } = Object.fromEntries(new URL(request.url).searchParams.entries());
  const kind = z.enum(["PREVIA", "BPA_C", "BPA_I", "CUSTO"]).parse(tipo || "PREVIA"), format = z.enum(["pdf", "csv"]).parse(formato || "pdf");
  let body: BodyInit, contentType: string;
  if (format === "pdf") { body = byteStream(await healthBillingDocument(context, query, kind)); contentType = "application/pdf"; }
  else {
    const rows = kind === "CUSTO" ? (await healthPatientConsumptionCost(context, query)).rows : (await healthBillingPreview(context, query)).rows;
    const columns = rows.length ? Object.keys(rows[0]) : kind === "CUSTO" ? ["movementId", "material", "warehouse", "netQuantity", "cost"] : ["id", "originType", "originId", "quantity", "value", "status"];
    const cell = (value: unknown) => { const text = value === null || value === undefined ? "Não informado" : Array.isArray(value) ? value.join("; ") : String(value); return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; };
    body = `\uFEFF${[columns, ...rows.map(row => columns.map(column => (row as unknown as Record<string, unknown>)[column]))].map(row => row.map(cell).join(";")).join("\r\n")}\r\n`; contentType = "text/csv; charset=utf-8";
  }
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_BILLING_PREVIEW", targetId: kind });
  return new Response(body, { headers: { "Content-Type": contentType, "Content-Disposition": `inline; filename="saude-${kind.toLowerCase()}.${format}"`, "Cache-Control": "private, no-store" } });
}
