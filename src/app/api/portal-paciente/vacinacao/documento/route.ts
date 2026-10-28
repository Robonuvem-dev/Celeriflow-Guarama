import { getPatientPortalAccess } from "@/lib/portal-paciente/access";
import { vaccinationPatientDocument } from "@/lib/saude/vaccination-document-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
import { byteStream } from "@/lib/transparencia/export-files";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await getPatientPortalAccess();
  if (access.status !== "AVAILABLE") return Response.json({ error: "Paciente não vinculado à sessão." }, { status: 403 });
  const context = { ...access.context, user: { ...access.context.user, hasHealthAccessScope: false } };
  const certificate = new URL(request.url).searchParams.get("kind") === "CERTIFICATE";
  const bytes = await vaccinationPatientDocument(context, access.patient.id, certificate ? "CERTIFICATE" : "CARD");
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: certificate ? "VACCINATION_CERTIFICATE" : "VACCINATION_CARD", targetId: access.patient.id });
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certificate ? "regularidade-vacinal" : "carteira-vacinacao"}.pdf"`, "Cache-Control": "private, no-store" } });
}
