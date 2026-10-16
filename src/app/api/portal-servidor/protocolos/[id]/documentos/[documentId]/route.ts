import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnFunctionalRequest } from "@/lib/portal-servidor/functional-requests";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const { id, documentId } = await params;
    const own = await readOwnFunctionalRequest(access.context.prisma, access.employee.id, id);
    if (!own.payload.attachments.some(document => document.documentId === documentId)) throw new AccessError("Documento indisponível.", 404);
    const version = await access.context.prisma.documentVersion.findFirst({ where: { documentId, versionNumber: 1, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] }, processDocuments: { some: { processId: own.process.id, purpose: "REQUERIMENTO_FUNCIONAL" } } } } });
    if (!version) throw new AccessError("Documento indisponível.", 404);
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade do documento inválida.", 423);
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.documentDownload, targetType: "EMPLOYEE_PORTAL_DOCUMENT", targetId: documentId });
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível obter o documento." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
