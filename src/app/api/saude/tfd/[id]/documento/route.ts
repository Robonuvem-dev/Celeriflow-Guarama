import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { tfdPatientDocument } from "@/lib/saude/tfd-document-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
import { byteStream } from "@/lib/transparencia/export-files";
import { z } from "zod";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports");
  const id = decodeURIComponent((await params).id), query = new URL(request.url).searchParams;
  const kind = z.enum(["LAUDO", "PEDIDO"]).parse(query.get("tipo") || "LAUDO");
  const version = query.has("versao") ? z.coerce.number().int().positive().parse(query.get("versao")) : undefined;
  const bytes = await tfdPatientDocument(context, id, kind, version);
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_TFD_REQUEST", targetId: id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="tfd-${kind.toLowerCase()}.pdf"`, "Cache-Control": "private, no-store" } });
}
