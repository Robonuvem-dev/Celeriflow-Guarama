import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getFile, downloadFilename } from "@/lib/platform/blob";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const medicalRecordId = decodeURIComponent(parameters.id), documentId = decodeURIComponent(parameters.documentId);
  const record = await context.prisma.medicalRecord.findUniqueOrThrow({ where: { id: medicalRecordId }, select: { unitId: true } }); assertHealthUnitAccess(context.user, record.unitId);
  const link = await context.prisma.healthClinicalDocument.findFirst({ where: { medicalRecordId, documentId }, include: { document: { include: { versions: { where: { status: { in: ["SIGNED", "FINAL"] } }, orderBy: { versionNumber: "desc" }, take: 1 } } } } });
  if (!link) return Response.json({ error: "Documento clínico não encontrado." }, { status: 404 });
  const file = await getFile(link.document.versions[0]?.fileUrl || link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
