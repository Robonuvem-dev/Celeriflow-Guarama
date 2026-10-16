import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { tfdTripDocument } from "@/lib/saude/tfd-trip-document";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const bytes = await tfdTripDocument(context, id);
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_TFD_TRIP", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="ordem-trafego-tfd.pdf"', "Cache-Control": "private, no-store" } });
}
