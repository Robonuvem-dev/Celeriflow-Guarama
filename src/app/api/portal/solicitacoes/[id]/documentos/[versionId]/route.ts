import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { portalServiceRequests } from "@/db/schema/portal-services";
import { processes } from "@/db/schema/processes";
import { readPortalResultDocument } from "@/db/repositories/portal-content/services";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { readOwnPortalRequest } from "@/lib/portal-cidadao/requests";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { AccessError } from "@/lib/platform/tenant-context";
import { getVersionSignatureStatus } from "@/lib/documents/document-flow-policy";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const { id, versionId } = await params, account = await getCitizenApiAccount();
    const [binding] = await db.select({ actorId: portalServiceRequests.actorId, processId: portalServiceRequests.processId }).from(portalServiceRequests).where(eq(portalServiceRequests.id, id)).limit(1);
    if (!binding) throw new AccessError("Documento indisponível.", 404);
    let resultDocument = false;
    if (binding.actorId === account.id) {
      const own = await readOwnPortalRequest(db, account.id, id);
      resultDocument = own.events.some((event) => event.documentVersionId === versionId);
      if (!resultDocument && !own.uploads.some((upload) => upload.documentVersionId === versionId)) throw new AccessError("Documento não liberado para o titular.", 404);
    } else {
      const context = await getProtocolContext();
      if (!(await db.select({ id: processes.id }).from(processes).where(and(eq(processes.id, binding.processId), protocolScopeCondition(context))).limit(1)).length) throw new AccessError("Documento indisponível ao setor.", 404);
    }
    const version = await readPortalResultDocument(db, binding.processId, versionId);
    if (!version || (resultDocument && (getVersionSignatureStatus(version.signatures) === "PENDING_SIGNATURE" || (version.document.documentClass?.signaturePolicy !== "INTERNAL_ALLOWED" && (version.status !== "SIGNED" || !version.signatures.some((item) => item.status === "SIGNED")))))) throw new AccessError("Documento revogado ou assinatura pendente.", 423);
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade do arquivo inválida.", 423);
    await insertAuditEvent(db, { actorUsuarioId: account.id, eventType: auditEventTypes.documentDownload, targetType: "PORTAL_REQUEST_DOCUMENT", targetId: version.id });
    return new Response(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return portalApiError(error); }
}
