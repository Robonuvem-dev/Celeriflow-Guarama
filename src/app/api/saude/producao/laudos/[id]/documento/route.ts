import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { treatmentPatientDocument } from "@/lib/saude/treatment-document-service";
import { db } from "@/db/client";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const query = new URL(request.url).searchParams;
  const kind = z.enum(["LAUDO", "AUTORIZACAO"]).parse(query.get("tipo") || "LAUDO");
  const version = query.has("versao") ? z.coerce.number().int().positive().parse(query.get("versao")) : undefined;
  const bytes = await treatmentPatientDocument(context, id, kind, version);
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_TREATMENT_REPORT", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind.toLowerCase()}-aih-apac.pdf"`, "Cache-Control": "private, no-store" } });
}
