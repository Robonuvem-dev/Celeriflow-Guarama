import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { medicalRecords, healthClinicalDocuments } from "@/db/schema/health-care";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const medicalRecordId = decodeURIComponent(parameters.id), documentId = decodeURIComponent(parameters.documentId);
  const database = context.database ?? db;
  const [record] = await database.select({ unitId: medicalRecords.unitId }).from(medicalRecords).where(eq(medicalRecords.id, medicalRecordId)).limit(1); if (!record) throw new Error("Atendimento não encontrado."); assertHealthUnitAccess(context.user, record.unitId);
  const [link] = await database.select({ document: { title: documents.title, fileUrl: documents.fileUrl } }).from(healthClinicalDocuments).innerJoin(documents, eq(documents.id, healthClinicalDocuments.documentId)).where(and(eq(healthClinicalDocuments.medicalRecordId, medicalRecordId), eq(healthClinicalDocuments.documentId, documentId))).limit(1);
  if (!link) return Response.json({ error: "Documento clínico não encontrado." }, { status: 404 });
  const [version] = await database.select({ fileUrl: documentVersions.fileUrl }).from(documentVersions).where(and(eq(documentVersions.documentId, documentId), inArray(documentVersions.status, ["SIGNED", "FINAL"]))).orderBy(desc(documentVersions.versionNumber)).limit(1);
  const file = await getFile(version?.fileUrl || link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
