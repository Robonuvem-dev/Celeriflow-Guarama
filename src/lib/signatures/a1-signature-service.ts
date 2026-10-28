import "server-only";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { digitalCertificates, documentVersions, documentClasses, documentSignatures, documentIcpEvidence, certificateUseAudits } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import type { DigitalCertificate } from "@/lib/contracts/documents";
import { createPublicValidationCode } from "@/lib/documents/document-flow-policy";
import { inspectIcpBrasilCertificate, resolveReferencedA1Config, signDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

export async function registerA1Certificate(db: DatabaseExecutor, actorUsuarioId: string, input: { alias: string; ownerName: string; credentialReference: string; certificatePem: string; intermediatePems?: string[]; trustedRootPem: string; purposes?: string[] }): Promise<DigitalCertificate> {
  if (!input.alias.trim() || !input.ownerName.trim()) throw new Error("Alias e titular do certificado são obrigatórios.");
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(input.credentialReference)) throw new Error("A referência do segredo deve ser um prefixo de variável de ambiente válido.");
  const metadata = inspectIcpBrasilCertificate(input.certificatePem);
  const [certificate] = await db.insert(digitalCertificates).values({ alias: input.alias.trim(), ownerName: input.ownerName.trim(), credentialReference: input.credentialReference, certificatePem: input.certificatePem.trim(), intermediatePems: input.intermediatePems ?? [], trustedRootPem: input.trustedRootPem.trim(), purposes: input.purposes?.length ? input.purposes : ["GED"], createdByUsuarioId: actorUsuarioId, ...metadata }).returning();
  return certificate;
}

export async function setA1CertificateStatus(db: DatabaseExecutor, certificateId: string, status: "ACTIVE" | "SUSPENDED" | "REVOKED"): Promise<DigitalCertificate> {
  const [certificate] = await db.update(digitalCertificates).set({ status }).where(eq(digitalCertificates.id, certificateId)).returning();
  if (!certificate) throw new Error("Certificado não encontrado.");
  return certificate;
}

export async function signDocumentVersionWithA1(db: DatabaseConnection, actor: { id: string; name: string; email: string; employeeId: string | null }, input: { documentVersionId: string; certificateId: string; purpose: string }) {
  return withDatabaseTransaction(db, tx => signDocumentVersionWithA1InTransaction(tx, actor, input), { timeoutMs: 30000 });
}

export async function signDocumentVersionWithA1InTransaction(db: DatabaseTransaction, actor: { id: string; name: string; email: string; employeeId: string | null }, input: { documentVersionId: string; certificateId: string; purpose: string }) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`A1_SIGNATURE:${input.documentVersionId}`}))`);
  await db.execute(sql`SELECT d.id FROM "Document" d JOIN "DocumentVersion" v ON v."documentId"=d.id WHERE v.id=${input.documentVersionId} FOR UPDATE OF d`);
  await db.execute(sql`SELECT id FROM "DigitalCertificate" WHERE id=${input.certificateId} FOR SHARE`);
  await db.execute(sql`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR UPDATE`);
  const correlationId = randomUUID();
  const [version, certificate] = await Promise.all([
    db.select({ id: documentVersions.id, documentId: documentVersions.documentId, hashSha256: documentVersions.hashSha256, status: documentVersions.status, lockedAt: documentVersions.lockedAt, documentStatus: documents.status, signaturePolicy: documentClasses.signaturePolicy, evidenceId: documentIcpEvidence.id }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).leftJoin(documentIcpEvidence, eq(documentIcpEvidence.documentVersionId, documentVersions.id)).where(eq(documentVersions.id, input.documentVersionId)).limit(1).then(rows => rows[0]),
    db.select().from(digitalCertificates).where(eq(digitalCertificates.id, input.certificateId)).limit(1).then(rows => rows[0]),
  ]);
  if (!version || version.evidenceId) throw new Error("Versão inexistente ou já assinada com A1.");
  if (version.status !== "FINAL" || version.lockedAt) throw new Error("Somente uma versão final e desbloqueada pode receber assinatura A1.");
  if (version.documentStatus !== "Válido") throw new Error("Documento indisponível para assinatura A1.");
  if (version.signaturePolicy !== "ICP_REQUIRED") throw new Error("A classe documental não exige assinatura ICP-Brasil.");
  if (!certificate || certificate.status !== "ACTIVE" || certificate.validFrom > new Date() || certificate.validTo < new Date()) throw new Error("Certificado A1 inexistente, inativo ou fora da validade.");
  const purposes = Array.isArray(certificate.purposes) ? certificate.purposes.filter((value): value is string => typeof value === "string") : [];
  if (!purposes.includes(input.purpose)) throw new Error("O certificado não está autorizado para esta finalidade.");
  const intermediatePems = Array.isArray(certificate.intermediatePems) ? certificate.intermediatePems.filter((value): value is string => typeof value === "string") : [];
  const config = resolveReferencedA1Config({ credentialReference: certificate.credentialReference, certificatePem: certificate.certificatePem, intermediateCertificatePems: intermediatePems, trustedRootCertificatePem: certificate.trustedRootPem });
  const evidence = signDocumentHashICPBrasil(version.id, version.hashSha256, config);

  const tx = db;
    const [current] = await tx.select({ status: documentVersions.status }).from(documentVersions).where(eq(documentVersions.id, version.id)).limit(1);
    if (current?.status !== "FINAL") throw new Error("A versão foi alterada durante a assinatura.");
    const [signature] = await tx.insert(documentSignatures).values({ documentId: version.documentId, documentVersionId: version.id, signerUsuarioId: actor.id, signerEmployeeId: actor.employeeId, signerName: actor.name, signerEmail: actor.email, signatureType: "SIGN", provider: "ICP_BRASIL_A1", isRequired: true, requestedByUsuarioId: actor.id, authenticationMethod: "SESSION_AND_A1_PRIVATE_KEY", reauthenticatedAt: evidence.signedAt, documentHash: version.hashSha256, verificationCode: createPublicValidationCode(), status: "SIGNED", requestedAt: evidence.signedAt, signedAt: evidence.signedAt }).returning({ id: documentSignatures.id });
    await tx.insert(documentIcpEvidence).values({ documentVersionId: version.id, documentSignatureId: signature.id, certificateId: certificate.id, documentHash: evidence.documentHash, canonicalPayload: evidence.canonicalPayload, signatureBase64: evidence.signatureBase64, algorithm: evidence.algorithm, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerial: evidence.certificateSerialNumber, certificateFingerprint: evidence.certificateFingerprint256, certificatePemSnapshot: evidence.certificatePem, intermediatePemsSnapshot: intermediatePems, trustedRootPemSnapshot: certificate.trustedRootPem, signedAt: evidence.signedAt, createdByUsuarioId: actor.id });
    await tx.update(documentVersions).set({ status: "SIGNED", lockedAt: evidence.signedAt }).where(eq(documentVersions.id, version.id));
    await tx.update(documents).set({ status: "Assinado" }).where(eq(documents.id, version.documentId));
    await tx.insert(certificateUseAudits).values({ certificateId: certificate.id, documentVersionId: version.id, actorUsuarioId: actor.id, purpose: input.purpose, documentHash: version.hashSha256, correlationId, outcome: "SUCCESS" });
    return { signatureId: signature.id, correlationId };
}

export async function recordA1Failure(db: DatabaseExecutor, input: { certificateId?: string; documentVersionId?: string; actorUsuarioId: string; purpose: string; errorCode: string }) {
  await db.insert(certificateUseAudits).values({ certificateId: input.certificateId || null, documentVersionId: input.documentVersionId || null, actorUsuarioId: input.actorUsuarioId, purpose: input.purpose, correlationId: randomUUID(), outcome: "FAILURE", errorCode: input.errorCode.slice(0, 80) });
}
