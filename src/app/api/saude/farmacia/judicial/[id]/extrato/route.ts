import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { pharmacyJudicialStatement } from "@/lib/saude/pharmacy-judicial-document";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const bytes = await pharmacyJudicialStatement(context, id);
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_PHARMACY_JUDICIAL_CASE", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="extrato-processo-farmaceutico.pdf"', "Cache-Control": "private, no-store" } });
}
