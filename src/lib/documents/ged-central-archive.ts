import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { documentClasses, documentVersions } from "@/db/schema/document-workflow";
import { centralRecords } from "@/db/schema/signature-central";
import { gedCentralArchives, gedEntries, gedJobs, gedVersionFiles } from "@/db/schema/ged-management";
import { centralOwnerFilter } from "@/db/repositories/documents/central";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { assertCentralPermission, verifyCentralRecord } from "@/lib/signatures/central-service";
import { centralBlobStore } from "@/lib/signatures/central-storage";
import { getBlobDocumentPrefix } from "@/lib/platform/blob";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { canUseGed } from "./ged-access";
import { gedHash, readGedBytes } from "./ged-storage";
import { snapshotRetentionMonths } from "./document-flow-policy";

export async function archiveCentralInGed(context: AppContext, recordId: string, classCode: string) {
  assertCentralPermission(context);
  if (!canUseGed(context.user, "import")) throw new Error("Sem permissão para arquivar no GED.");
  // The retention worker locks this same row before physical deletion. Holding
  // it through copy+commit makes expiration and archival mutually exclusive.
  return withDatabaseTransaction(databaseConnection, async tx => {
    const [record] = await tx.select().from(centralRecords).where(and(eq(centralRecords.id, recordId), centralOwnerFilter(context.user.id, isSystemAdministrator(context.user)))).for("update");
    if (!record) throw new Error("Registro não encontrado.");
    const [existing] = await tx.select().from(gedCentralArchives).where(eq(gedCentralArchives.recordId, recordId));
    if (existing) return { documentId: existing.documentId };
    if (record.storageDeletedAt || record.expiresAt <= new Date() || !verifyCentralRecord(record)) throw new Error("Original expirado, indisponível ou evidência inválida.");
    const [documentClass] = await tx.select().from(documentClasses).where(and(eq(documentClasses.code, classCode), eq(documentClasses.isActive, true)));
    if (!documentClass) throw new Error("Selecione uma classe documental ativa.");
    const bytes = await centralBlobStore.get(record.blobPath);
    if (!bytes || bytes.length !== record.byteLength || gedHash(bytes) !== record.hashSha256) throw new Error("A integridade do original não foi confirmada.");
    const safe = record.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const copied = await put(`${getBlobDocumentPrefix()}ged/central/${record.id}/${safe}`, bytes, { access: "private", contentType: record.mimeType, addRandomSuffix: false, allowOverwrite: true });
    await readGedBytes(copied.url, record.hashSha256);
    const { getInstanceConfigurationDefaults } = await import("@/lib/platform/instance-configuration");
    const [configured] = await tx.select({ value: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, "DOCUMENT_DEFAULT_RETENTION_MONTHS")).orderBy(instanceParameters.createdAt).limit(1);
    const retentionMonths = snapshotRetentionMonths(typeof configured?.value === "number" ? configured.value : getInstanceConfigurationDefaults().DOCUMENT_DEFAULT_RETENTION_MONTHS);
    const [document] = await tx.insert(documents).values({ title: record.filename, documentType: record.evidence?.envelope.documentType.name || "Arquivo assinado", documentClassId: documentClass.id, fileUrl: copied.url, status: "Assinado", retentionMonths }).returning({ id: documents.id });
    // Keep the original verifier/code: do not forge a GED signature for an
    // envelope whose signed identity is a SignatureCentralRecord.
    const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: copied.url, hashSha256: record.hashSha256, status: "FINAL" }).returning({ id: documentVersions.id });
    await tx.insert(gedEntries).values({ documentId: document.id, ownerId: context.user.id, departmentId: context.user.departmentId, filename: record.filename, mimeType: record.mimeType, byteLength: record.byteLength, origin: "CENTRAL", editorialStatus: "ASSINADO_CENTRAL", legacyReference: record.code });
    await tx.insert(gedCentralArchives).values({ recordId, documentId: document.id, versionId: version.id });
    await tx.insert(gedJobs).values({ versionId: version.id });
    await tx.insert(gedVersionFiles).values({ versionId: version.id, filename: record.filename, mimeType: record.mimeType, byteLength: record.byteLength, authorId: context.user.id, comment: `Original assinado na Central: ${record.code}` });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "GED_DOCUMENT_INGESTED", targetType: "CENTRAL_ARCHIVE", targetId: record.id });
    return { documentId: document.id };
  }, { timeoutMs: 60_000 });
}
