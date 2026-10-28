import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { assertCemeteryAttachmentTarget } from "@/lib/cemeteries/attachments";
import { db } from "@/db/client";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { readCemeteryAttachmentDownload } from "@/db/repositories/cemeteries/attachments";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("CEMITERIOS");
    const { id } = await params;
    const row = await readCemeteryAttachmentDownload(db, id);
    if (!row) throw new AccessError("Anexo não encontrado.", 404);
    if (!["LOTE", "SEPULTURA", "SEPULTAMENTO", "VELORIO", "CREMACAO"].includes(row.targetType)) throw new AccessError("Destino inválido.", 404);
    await assertCemeteryAttachmentTarget(db, { targetType: row.targetType as "LOTE" | "SEPULTURA" | "SEPULTAMENTO" | "VELORIO" | "CREMACAO", targetId: row.targetId });
    const document = row;
    // Shared/external GED documents keep their original module access rules.
    if (document.documentType !== "CEMITERIO" || document.notes !== "Upload próprio do módulo Cemitérios" || document.shared) {
      return NextResponse.redirect(new URL(`/api/download?url=${encodeURIComponent(document.fileUrl)}`, request.url));
    }
    if (document.status !== "Válido") throw new AccessError("Documento indisponível.", 403);
    if (!document.hashSha256) throw new AccessError("Versão GED indisponível.", 403);
    const file = await getFile(document.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo não encontrado.", 404);
    const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== document.hashSha256) throw new AccessError("Arquivo diverge da versão GED.", 403);
    await insertAuditEvent(db, { actorUsuarioId: context.user.id, eventType: "DOCUMENT_DOWNLOAD", targetType: "CEMETERY_ATTACHMENT", targetId: row.id });
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof AccessError ? e.message : "Download indisponível." }, { status: e instanceof AccessError ? e.status : 500 }); }
}
