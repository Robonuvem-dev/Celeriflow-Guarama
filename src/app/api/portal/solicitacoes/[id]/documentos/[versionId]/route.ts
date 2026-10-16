import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { readOwnPortalRequest } from "@/lib/portal-cidadao/requests";
import { getProtocolContext, protocolScope } from "@/lib/protocols/access";
import { AccessError } from "@/lib/platform/tenant-context";
import { getVersionSignatureStatus } from "@/lib/documents/document-flow-policy";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const { id, versionId } = await params, account = await getCitizenApiAccount();
    const binding = await prisma.portalServiceRequest.findUnique({ where: { id }, select: { actorId: true, processId: true } });
    if (!binding) throw new AccessError("Documento indisponível.", 404);
    let resultDocument = false;
    if (binding.actorId === account.id) {
      const own = await readOwnPortalRequest(prisma, account.id, id);
      resultDocument = own.events.some((event) => event.documentVersionId === versionId);
      if (!resultDocument && !own.uploads.some((upload) => upload.documentVersionId === versionId)) throw new AccessError("Documento não liberado para o titular.", 404);
    } else {
      const context = await getProtocolContext();
      if (!await prisma.process.findFirst({ where: { AND: [{ id: binding.processId }, protocolScope(context)] }, select: { id: true } })) throw new AccessError("Documento indisponível ao setor.", 404);
    }
    const version = await prisma.documentVersion.findFirst({ where: { id: versionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] }, processDocuments: { some: { processId: binding.processId } } } }, include: { signatures: true, document: { include: { documentClass: true } } } });
    if (!version || (resultDocument && (getVersionSignatureStatus(version.signatures) === "PENDING_SIGNATURE" || (version.document.documentClass?.signaturePolicy !== "INTERNAL_ALLOWED" && (version.status !== "SIGNED" || !version.signatures.some((item) => item.status === "SIGNED")))))) throw new AccessError("Documento revogado ou assinatura pendente.", 423);
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade do arquivo inválida.", 423);
    await writeAuditEvent(prisma, { actorUsuarioId: account.id, eventType: auditEventTypes.documentDownload, targetType: "PORTAL_REQUEST_DOCUMENT", targetId: version.id });
    return new Response(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return portalApiError(error); }
}
