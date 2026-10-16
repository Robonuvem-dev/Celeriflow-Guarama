import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { assertCemeteryAttachmentTarget } from "@/lib/cemeteries/attachments";
import { writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("CEMITERIOS");
    const { id } = await params;
    const row = await context.prisma.cemeteryAttachment.findUnique({ where: { id }, include: { document: { include: { versions: true, processDocuments: true, ticketLinks: true, ombudsmanLinks: true, healthClinicalDocument: true, healthStandardDocument: true } } } });
    if (!row) throw new AccessError("Anexo não encontrado.", 404);
    if (!["LOTE", "SEPULTURA", "SEPULTAMENTO", "VELORIO", "CREMACAO"].includes(row.targetType)) throw new AccessError("Destino inválido.", 404);
    await assertCemeteryAttachmentTarget(context.prisma, { targetType: row.targetType as "LOTE" | "SEPULTURA" | "SEPULTAMENTO" | "VELORIO" | "CREMACAO", targetId: row.targetId });
    const document = row.document;
    // Shared/external GED documents keep their original module access rules.
    if (document.documentType !== "CEMITERIO" || document.notes !== "Upload próprio do módulo Cemitérios" || document.processDocuments.length || document.ticketLinks.length || document.ombudsmanLinks.length || document.healthClinicalDocument || document.healthStandardDocument || await context.prisma.sstCertificateDocument.count({ where: { documentId: document.id } })) {
      return NextResponse.redirect(new URL(`/api/download?url=${encodeURIComponent(document.fileUrl)}`, request.url));
    }
    if (document.status !== "Válido") throw new AccessError("Documento indisponível.", 403);
    const version = document.versions.find(v => v.fileUrl === document.fileUrl && ["FINAL", "SIGNED"].includes(v.status));
    if (!version) throw new AccessError("Versão GED indisponível.", 403);
    const file = await getFile(document.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo não encontrado.", 404);
    const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Arquivo diverge da versão GED.", 403);
    await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: "DOCUMENT_DOWNLOAD", targetType: "CEMETERY_ATTACHMENT", targetId: row.id });
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof AccessError ? e.message : "Download indisponível." }, { status: e instanceof AccessError ? e.status : 500 }); }
}
