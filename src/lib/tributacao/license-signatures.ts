import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { renderConfiguredLicensePdf } from "./license-pdf";
import { uploadProcessFile, deleteUploadedDocument, getFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { signDocumentVersionWithA1InTransaction } from "@/lib/signatures/a1-signature-service";
import { verifyDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

async function assertLicenseSigningAccess(db: PrismaClient | Prisma.TransactionClient, actor: TaxActor, licenseId: string, expectedUpdatedAt: string) {
  const license = await db.license.findUniqueOrThrow({ where: { id: licenseId } });
  const issuance = await db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "LICENSE", entityId: licenseId, category: "LICENSE_ISSUANCE" } });
  const data = taxScopeSnapshot(issuance.data);
  if (typeof data.governmentEntityId !== "string" || typeof data.budgetUnitId !== "string" || !license.qrCode || data.authCode !== license.qrCode) throw new Error("Alvará sem emissão ou origem conciliada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(data.budgetUnitId)) throw new Error("Alvará fora da UG autorizada.");
  if (!await db.planningEntityUnit.findFirst({ where: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId } })) throw new Error("Origem do alvará não conciliada.");
  if (license.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Alvará alterado. Recarregue antes de assinar.");
  if (license.status !== "Emitido" || !license.validUntil || license.validUntil < new Date()) throw new Error("Somente alvará emitido e vigente pode receber assinatura.");
  return { license, issuance, scope: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId } };
}

export async function signConfiguredLicense(db: PrismaClient, actor: TaxActor & { name: string; email: string }, raw: { licenseId: string; expectedUpdatedAt: string; certificateId: string }) {
  const input = z.object({ licenseId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), certificateId: z.string().min(1) }).parse(raw);
  const position = await assertLicenseSigningAccess(db, actor, input.licenseId, input.expectedUpdatedAt);
  const bytes = await renderConfiguredLicensePdf(db, position.license.qrCode!);
  const blob = await uploadProcessFile(new File([Buffer.from(bytes)], "alvara-assinado.pdf", { type: "application/pdf" }));
  try {
    return await ingestGedDocument(db, { title: `Alvará ${position.license.qrCode}`, documentType: "Alvará assinado", documentClassCode: "TAX_LICENSE_SIGNED", publicLabel: "Alvará municipal assinado", actorUsuarioId: actor.usuarioId, fileUrl: blob.url, content: bytes, afterCreate: async (tx, documentId) => {
      await tx.$queryRaw`SELECT id FROM "License" WHERE id=${input.licenseId} FOR UPDATE`;
      const current = await assertLicenseSigningAccess(tx, actor, input.licenseId, input.expectedUpdatedAt);
      if (await tx.taxRegistryEntry.findFirst({ where: { entityType: "LICENSE", entityId: input.licenseId, category: "LICENSE_SIGNATURE" } })) throw new Error("Alvará já possui original assinado. Consulte o documento preservado.");
      if (current.issuance.id !== position.issuance.id) throw new Error("Memória da emissão alterada antes da assinatura.");
      const version = await tx.documentVersion.findFirstOrThrow({ where: { documentId, versionNumber: 1 } });
      const signature = await signDocumentVersionWithA1InTransaction(tx, { id: actor.usuarioId, name: actor.name, email: actor.email, employeeId: actor.employeeId }, { documentVersionId: version.id, certificateId: input.certificateId, purpose: "GED" });
      await tx.taxRegistryEntry.create({ data: { entityType: "LICENSE", entityId: input.licenseId, category: "LICENSE_SIGNATURE", title: "Original do alvará com assinatura ICP-Brasil", actorUsuarioId: actor.usuarioId, documentId, data: { ...current.scope, issuanceId: current.issuance.id, authCode: current.license.qrCode, licenseUpdatedAt: input.expectedUpdatedAt, documentVersionId: version.id, sha256: version.hashSha256, signatureId: signature.signatureId, certificateId: input.certificateId, signedAt: new Date().toISOString(), signatureFormat: "DETACHED_DOCUMENT_HASH" } } });
      await tx.taxAuditLog.create({ data: { action: "SIGN_CONFIGURED_LICENSE", entityType: "License", entityId: input.licenseId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...current.scope, documentId, versionId: version.id, signatureId: signature.signatureId, sha256: version.hashSha256 } } });
    } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => undefined); throw error; }
}

export async function readSignedLicenseArtifact(db: PrismaClient, code: string) {
  z.uuid().parse(code);
  const snapshot = await db.$transaction(async tx => {
    const license = await tx.license.findFirstOrThrow({ where: { qrCode: code } });
    const issuance = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "LICENSE", entityId: license.id, category: "LICENSE_ISSUANCE" } });
    const entry = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "LICENSE", entityId: license.id, category: "LICENSE_SIGNATURE" } });
    const data = taxScopeSnapshot(entry.data); const origin = taxScopeSnapshot(issuance.data);
    if (data.authCode !== code || origin.authCode !== code || data.issuanceId !== issuance.id || data.governmentEntityId !== origin.governmentEntityId || data.budgetUnitId !== origin.budgetUnitId || !entry.documentId) throw new Error("Assinatura e emissão divergentes.");
    const version = await tx.documentVersion.findFirstOrThrow({ where: { id: String(data.documentVersionId), documentId: entry.documentId, status: "SIGNED", document: { status: "Assinado" } }, include: { icpEvidence: true } });
    const evidence = version.icpEvidence;
    if (!evidence || evidence.validationStatus !== "VALID_AT_SIGNING" || evidence.documentHash !== version.hashSha256 || data.sha256 !== version.hashSha256 || evidence.documentSignatureId !== data.signatureId) throw new Error("Evidência de assinatura não conciliada.");
    return { version, evidence, licenseStatus: license.status, valid: license.status === "Emitido" && !!license.validUntil && license.validUntil >= new Date() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const file = await getFile(snapshot.version.fileUrl);
  if (!file?.stream) throw new Error("Original assinado indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== snapshot.version.hashSha256) throw new Error("Integridade do original assinado inválida.");
  const evidence = snapshot.evidence;
  if (evidence.algorithm !== "SHA256") throw new Error("Algoritmo de assinatura não suportado.");
  const verification = verifyDocumentHashICPBrasil({ documentVersionId: snapshot.version.id, documentHash: snapshot.version.hashSha256, canonicalPayload: evidence.canonicalPayload, signedAt: evidence.signedAt, signatureBase64: evidence.signatureBase64, algorithm: "SHA256", certificatePem: evidence.certificatePemSnapshot, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerialNumber: evidence.certificateSerial, certificateFingerprint256: evidence.certificateFingerprint }, { intermediateCertificatePems: Array.isArray(evidence.intermediatePemsSnapshot) ? evidence.intermediatePemsSnapshot.filter((value): value is string => typeof value === "string") : [], trustedRootCertificatePem: evidence.trustedRootPemSnapshot });
  if (!verification) throw new Error("Assinatura ICP-Brasil inválida.");
  return { bytes, valid: snapshot.valid, licenseStatus: snapshot.licenseStatus, signature: { documentVersionId: snapshot.version.id, documentHash: snapshot.version.hashSha256, canonicalPayload: evidence.canonicalPayload, signatureBase64: evidence.signatureBase64, algorithm: evidence.algorithm, certificatePem: evidence.certificatePemSnapshot, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerialNumber: evidence.certificateSerial, certificateFingerprint256: evidence.certificateFingerprint, intermediateCertificatePems: evidence.intermediatePemsSnapshot, trustedRootCertificatePem: evidence.trustedRootPemSnapshot, signedAt: evidence.signedAt.toISOString() } };
}
