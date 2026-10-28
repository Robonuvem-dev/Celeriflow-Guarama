import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { tfdTripDocument } from "@/lib/saude/tfd-trip-document";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const bytes = await tfdTripDocument(context, id);
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_TFD_TRIP", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="ordem-trafego-tfd.pdf"', "Cache-Control": "private, no-store" } });
}
