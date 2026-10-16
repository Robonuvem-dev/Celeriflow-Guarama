import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { healthIndicatorDocument } from "@/lib/saude/health-indicator-document";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), query = new URL(request.url).searchParams;
  const document = await healthIndicatorDocument(context, { period: query.get("period"), unitId: query.get("unitId") || "", elderlyAge: query.get("elderlyAge") || 60, childMonths: query.get("childMonths") || 24, indicator: query.get("indicator") || "GESTATION", status: query.get("status") || "NO_RECORD", formato: query.get("formato") || "csv" });
  return new Response(byteStream(document.bytes), { headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename="${document.filename}"`, "Cache-Control": "private, no-store" } });
}
