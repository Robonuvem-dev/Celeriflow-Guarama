import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { vaccinationPatientDocument } from "@/lib/saude/vaccination-document-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const certificate = new URL(request.url).searchParams.get("kind") === "CERTIFICATE";
  const bytes = await vaccinationPatientDocument(context, id, certificate ? "CERTIFICATE" : "CARD");
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: certificate ? "VACCINATION_CERTIFICATE" : "VACCINATION_CARD", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certificate ? "regularidade-vacinal" : "carteira-vacinacao"}.pdf"`, "Cache-Control": "private, no-store" } });
}
