import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { db } from "@/db/client";
import { findPharmacyJudicialAttachment, readPharmacyJudicialCaseUnit } from "@/db/repositories/platform/health-exports";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), values = await params, id = decodeURIComponent(values.id), documentId = decodeURIComponent(values.documentId);
  const database = context.database ?? db;
  const current = await readPharmacyJudicialCaseUnit(database, id);
  assertHealthUnitAccess(context.user, current.unitId);
  const link = await findPharmacyJudicialAttachment(database, id, documentId);
  if (!link) return Response.json({ error: "Documento não pertence ao processo." }, { status: 404 });
  const file = await getFile(link.document.fileUrl);
  if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "private, no-store" } });
}
