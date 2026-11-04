import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socialAttachments } from "@/db/schema/social-workflows";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { getFile } from "@/lib/platform/blob";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("SOCIAL"), access = await resolveSocialAccess(context), database = context.database ?? db;
    const [row] = await database.select({ attachment: socialAttachments, document: documents }).from(socialAttachments).innerJoin(documents, eq(documents.id, socialAttachments.documentId)).where(eq(socialAttachments.id, (await params).id));
    if (!row || row.document.status === "Arquivado") throw new Error("Anexo inexistente."); assertSocialUnitAccess(access, row.attachment.unitId);
    const [version] = await database.select().from(documentVersions).where(and(eq(documentVersions.documentId, row.document.id), eq(documentVersions.status, "FINAL"))).orderBy(desc(documentVersions.versionNumber)).limit(1);
    if (!version) throw new Error("Documento indisponível.");
    const file = await getFile(version.fileUrl); if (!file?.stream) throw new Error("Arquivo indisponível no armazenamento.");
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new Error("Integridade inválida.");
    return new Response(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "Anexo indisponível ou fora do seu acesso." }, { status: 404 }); }
}
