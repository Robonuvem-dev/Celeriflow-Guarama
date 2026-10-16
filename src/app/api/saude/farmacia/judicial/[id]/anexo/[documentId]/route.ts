import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), values = await params, id = decodeURIComponent(values.id), documentId = decodeURIComponent(values.documentId);
  const current = await context.prisma.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id }, select: { unitId: true } });
  assertHealthUnitAccess(context.user, current.unitId);
  const link = await context.prisma.healthPharmacyJudicialDocument.findUnique({ where: { caseId_documentId: { caseId: id, documentId } }, include: { document: { select: { title: true, fileUrl: true } } } });
  if (!link) return Response.json({ error: "Documento não pertence ao processo." }, { status: 404 });
  const file = await getFile(link.document.fileUrl);
  if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "private, no-store" } });
}
