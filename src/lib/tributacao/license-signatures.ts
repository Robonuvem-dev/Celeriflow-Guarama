import "server-only";
import { createHash } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, readLicenseIssuance, readLicenseSignature } from "@/db/repositories/tax-economic/registry";
import { lockEconomicLicense, readEconomicLicense, readEconomicLicenseByCode, readFirstEconomicDocumentVersion, readSignedEconomicDocumentVersion } from "@/db/repositories/tax-economic/licenses";
import { hasEconomicOrigin } from "@/db/repositories/tax-economic/registrations";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { renderConfiguredLicensePdf } from "./license-pdf";
import { uploadProcessFile, deleteUploadedDocument, getFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { signDocumentVersionWithA1InTransaction } from "@/lib/signatures/a1-signature-service";
import { verifyDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

async function assertLicenseSigningAccess(db: DatabaseExecutor, actor: TaxActor, licenseId: string, expectedUpdatedAt: string) {
  const license = await readEconomicLicense(db, licenseId);
  const issuance = await readLicenseIssuance(db, licenseId);
  const data = taxScopeSnapshot(issuance.data);
  if (typeof data.governmentEntityId !== "string" || typeof data.budgetUnitId !== "string" || !license.qrCode || data.authCode !== license.qrCode) throw new Error("Alvará sem emissão ou origem conciliada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(data.budgetUnitId)) throw new Error("Alvará fora da UG autorizada.");
  if (!await hasEconomicOrigin(db, { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId })) throw new Error("Origem do alvará não conciliada.");
  if (license.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Alvará alterado. Recarregue antes de assinar.");
  if (license.status !== "Emitido" || !license.validUntil || license.validUntil < new Date()) throw new Error("Somente alvará emitido e vigente pode receber assinatura.");
  return { license, issuance, scope: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId } };
}

export async function signConfiguredLicense(db: DatabaseConnection, actor: TaxActor & { name: string; email: string }, raw: { licenseId: string; expectedUpdatedAt: string; certificateId: string }) {
  const input = z.object({ licenseId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), certificateId: z.string().min(1) }).parse(raw);
  const position = await assertLicenseSigningAccess(db.db, actor, input.licenseId, input.expectedUpdatedAt);
  const bytes = await renderConfiguredLicensePdf(db.db, position.license.qrCode!);
  const blob = await uploadProcessFile(new File([Buffer.from(bytes)], "alvara-assinado.pdf", { type: "application/pdf" }));
  try {
    return await ingestGedDocument(db, { title: `Alvará ${position.license.qrCode}`, documentType: "Alvará assinado", documentClassCode: "TAX_LICENSE_SIGNED", publicLabel: "Alvará municipal assinado", actorUsuarioId: actor.usuarioId, fileUrl: blob.url, content: bytes, afterCreate: async (tx, documentId) => {
      await lockEconomicLicense(tx, input.licenseId);
      const current = await assertLicenseSigningAccess(tx, actor, input.licenseId, input.expectedUpdatedAt);
      if (await readLicenseSignature(tx, input.licenseId)) throw new Error("Alvará já possui original assinado. Consulte o documento preservado.");
      if (current.issuance.id !== position.issuance.id) throw new Error("Memória da emissão alterada antes da assinatura.");
      const version = await readFirstEconomicDocumentVersion(tx, documentId);
      const signature = await signDocumentVersionWithA1InTransaction(tx, { id: actor.usuarioId, name: actor.name, email: actor.email, employeeId: actor.employeeId }, { documentVersionId: version.id, certificateId: input.certificateId, purpose: "GED" });
      await appendEconomicEntry(tx, { entityType: "LICENSE", entityId: input.licenseId, category: "LICENSE_SIGNATURE", title: "Original do alvará com assinatura ICP-Brasil", actorUsuarioId: actor.usuarioId, documentId, data: { ...current.scope, issuanceId: current.issuance.id, authCode: current.license.qrCode, licenseUpdatedAt: input.expectedUpdatedAt, documentVersionId: version.id, sha256: version.hashSha256, signatureId: signature.signatureId, certificateId: input.certificateId, signedAt: new Date().toISOString(), signatureFormat: "DETACHED_DOCUMENT_HASH" } });
      await appendEconomicAudit(tx, { action: "SIGN_CONFIGURED_LICENSE", entityType: "License", entityId: input.licenseId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...current.scope, documentId, versionId: version.id, signatureId: signature.signatureId, sha256: version.hashSha256 } });
    } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => undefined); throw error; }
}

export async function readSignedLicenseArtifact(db: DatabaseConnection, code: string) {
  z.uuid().parse(code);
  const snapshot = await withDatabaseTransaction(db, async tx => {
    const license = await readEconomicLicenseByCode(tx, code);
    const issuance = await readLicenseIssuance(tx, license.id);
    const entry = await readLicenseSignature(tx, license.id);
    if (!entry) throw new Error("Original assinado não encontrado.");
    const data = taxScopeSnapshot(entry.data); const origin = taxScopeSnapshot(issuance.data);
    if (data.authCode !== code || origin.authCode !== code || data.issuanceId !== issuance.id || data.governmentEntityId !== origin.governmentEntityId || data.budgetUnitId !== origin.budgetUnitId || !entry.documentId) throw new Error("Assinatura e emissão divergentes.");
    const version = await readSignedEconomicDocumentVersion(tx, String(data.documentVersionId), entry.documentId);
    const evidence = version.icpEvidence;
    if (!evidence || evidence.validationStatus !== "VALID_AT_SIGNING" || evidence.documentHash !== version.hashSha256 || data.sha256 !== version.hashSha256 || evidence.documentSignatureId !== data.signatureId) throw new Error("Evidência de assinatura não conciliada.");
    return { version, evidence, licenseStatus: license.status, valid: license.status === "Emitido" && !!license.validUntil && license.validUntil >= new Date() };
  }, { isolationLevel: "repeatable read", timeoutMs: 5000 });
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
