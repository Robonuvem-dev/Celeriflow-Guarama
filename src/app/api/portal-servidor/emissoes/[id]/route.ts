import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnPublishedDocuments } from "@/lib/portal-servidor/document-publication";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    // Resolve only the publication identifier; storage URLs are never browser input.
    const awaitedId = (await params).id;
    const publication = (await listOwnPublishedDocuments(access.context)).find(document => document.id === awaitedId);
    if (!publication) throw new AccessError("Documento indisponível.", 404);
    const file = await getFile(publication.payload.fileUrl); if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== publication.payload.hashSha256) throw new AccessError("Integridade documental inválida.", 423);
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.documentDownload, targetType: "EMPLOYEE_DOCUMENT_PUBLICATION", targetId: publication.id });
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/pdf", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o documento." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
