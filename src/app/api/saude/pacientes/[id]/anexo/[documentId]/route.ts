import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { scopedPatient } from "@/lib/saude/patient-registration-service";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { db } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { healthPatientDocuments } from "@/db/schema/health-registration";
import { documents } from "@/db/schema/registry";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const patientId = decodeURIComponent(parameters.id), documentId = decodeURIComponent(parameters.documentId);
  const database = context.database ?? db;
  await scopedPatient(database, context, patientId);
  const [link] = await database.select({ document: { fileUrl: documents.fileUrl, title: documents.title } }).from(healthPatientDocuments).innerJoin(documents, eq(documents.id, healthPatientDocuments.documentId)).where(and(eq(healthPatientDocuments.patientId, patientId), eq(healthPatientDocuments.documentId, documentId))).limit(1);
  if (!link) return Response.json({ error: "Documento não pertence ao paciente." }, { status: 404 });
  const file = await getFile(link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
