import JSZip from "jszip";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { documentVersions } from "@/db/schema/document-workflow";
import { gedVersionFiles } from "@/db/schema/ged-management";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { getGedContext } from "@/lib/documents/ged-access";
import { readGedBytes } from "@/lib/documents/ged-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    const context = await getGedContext();
    const database = context.database ?? db;
    const params = new URL(request.url).searchParams;
    const selections = z.array(z.object({ id: z.string().min(1).max(100), versionId: z.string().max(100).optional() })).min(1).max(50).parse(JSON.parse(params.get("items") || "[]"));
    const zip = new JSZip();
    const manifest: Array<{ documentId: string; versionId: string; version: number; filename: string; sha256: string }> = [];
    let total = 0;
    for (const selection of selections) {
      const document = await requireManagedDocument(context, selection.id);
      const [version] = await database.select().from(documentVersions).where(and(eq(documentVersions.documentId, selection.id), eq(documentVersions.id, selection.versionId || document.versionId)));
      if (!version) throw new Error("Versão não encontrada.");
      if (params.get("artifact")) {
        if (selections.length !== 1) throw new Error("Selecione um único derivado.");
        const artifacts = await database.execute<{ url: string; hash: string; mimeType: string }>(sql`SELECT url,hash,"mimeType" FROM "GedArtifact" WHERE id=${params.get("artifact")} AND "versionId"=${version.id}`);
        const artifact = artifacts.rows[0]; if (!artifact) throw new Error("Derivado não encontrado.");
        await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: "DOCUMENT_DOWNLOAD", targetType: "GED_ARTIFACT", targetId: params.get("artifact")! });
        return new Response(new Uint8Array(await readGedBytes(artifact.url, artifact.hash)), { headers: { "Content-Type": artifact.mimeType, "Content-Disposition": 'attachment; filename="documento-pesquisavel.pdf"', "Cache-Control": "private, no-store" } });
      }
      const [metadata] = await database.select().from(gedVersionFiles).where(eq(gedVersionFiles.versionId, version.id));
      const bytes = await readGedBytes(version.fileUrl, version.hashSha256);
      total += bytes.length;
      if (total > 60 * 1024 * 1024) throw new Error("Selecione um lote de até 60 MiB por download.");
      await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: "DOCUMENT_DOWNLOAD", targetType: "DOCUMENT_VERSION", targetId: version.id });
      const filename = (metadata?.filename || document.filename).replace(/[^\p{L}\p{N}._-]/gu, "-").slice(-120);
      if (selections.length === 1 && params.get("zip") !== "1") {
        const mimeType = metadata?.mimeType || document.mimeType;
        const inline = params.get("inline") === "1" && ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"].includes(mimeType);
        return new Response(bytes, { headers: { "Content-Type": mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
      }
      const name = `${manifest.length + 1}-v${version.versionNumber}-${filename}`;
      zip.file(name, bytes);
      manifest.push({ documentId: document.id, versionId: version.id, version: version.versionNumber, filename: name, sha256: version.hashSha256 });
    }
    zip.file("manifesto.json", JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2));
    return new Response(new Uint8Array(await zip.generateAsync({ type: "nodebuffer", compression: "STORE" })), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=acervo-documental.zip", "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error && !/query|constraint|postgres|https?:\/\//i.test(error.message) ? error.message : "Não foi possível recuperar os documentos." }, { status: 400 }); }
}
