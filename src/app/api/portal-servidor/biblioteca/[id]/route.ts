import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ownPortalContents } from "@/lib/portal-servidor/content-catalog";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return Response.json({ error: "Indisponível." }, { status: 403 });
  const database = access.context.database ?? db;
  const id = (await params).id;
  const content = (await ownPortalContents(database, access.employee.id)).find(item => item.id === id && item.data.kind !== "LOCAL");
  if (!content?.data.fileUrl) return Response.json({ error: "Documento indisponível." }, { status: 404 });
  const file = await getFile(content.data.fileUrl);
  if (!file?.stream) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== content.data.fileHash) return Response.json({ error: "Integridade do arquivo inválida." }, { status: 409 });
  await insertAuditEvent(database, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.documentDownload, targetType: "EMPLOYEE_PORTAL_LIBRARY", targetId: id });
  return new Response(bytes, { headers: { "Content-Type": content.data.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(content.data.fileName || "documento")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
