import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { scopedPatient } from "@/lib/saude/patient-registration-service";
import { getFile, downloadFilename } from "@/lib/platform/blob";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const patientId = decodeURIComponent(parameters.id), documentId = decodeURIComponent(parameters.documentId);
  await scopedPatient(context.prisma, context, patientId);
  const link = await context.prisma.healthPatientDocument.findUnique({ where: { patientId_documentId: { patientId, documentId } }, include: { document: { select: { fileUrl: true, title: true } } } });
  if (!link) return Response.json({ error: "Documento não pertence ao paciente." }, { status: 404 });
  const file = await getFile(link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
