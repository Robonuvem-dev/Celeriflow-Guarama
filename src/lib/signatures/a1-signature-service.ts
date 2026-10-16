import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createPublicValidationCode } from "@/lib/documents/document-flow-policy";
import { inspectIcpBrasilCertificate, resolveReferencedA1Config, signDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

export async function registerA1Certificate(db: PrismaClient, actorUsuarioId: string, input: { alias: string; ownerName: string; credentialReference: string; certificatePem: string; intermediatePems?: string[]; trustedRootPem: string; purposes?: string[] }) {
  if (!input.alias.trim() || !input.ownerName.trim()) throw new Error("Alias e titular do certificado são obrigatórios.");
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(input.credentialReference)) throw new Error("A referência do segredo deve ser um prefixo de variável de ambiente válido.");
  const metadata = inspectIcpBrasilCertificate(input.certificatePem);
  return db.digitalCertificate.create({ data: { alias: input.alias.trim(), ownerName: input.ownerName.trim(), credentialReference: input.credentialReference, certificatePem: input.certificatePem.trim(), intermediatePems: json(input.intermediatePems ?? []), trustedRootPem: input.trustedRootPem.trim(), purposes: json(input.purposes?.length ? input.purposes : ["GED"]), createdByUsuarioId: actorUsuarioId, ...metadata } });
}

export async function setA1CertificateStatus(db: PrismaClient, certificateId: string, status: "ACTIVE" | "SUSPENDED" | "REVOKED") {
  return db.digitalCertificate.update({ where: { id: certificateId }, data: { status } });
}

export async function signDocumentVersionWithA1(db: PrismaClient, actor: { id: string; name: string; email: string; employeeId: string | null }, input: { documentVersionId: string; certificateId: string; purpose: string }) {
  return db.$transaction(tx => signDocumentVersionWithA1InTransaction(tx, actor, input), { timeout: 30000 });
}

export async function signDocumentVersionWithA1InTransaction(db: Prisma.TransactionClient, actor: { id: string; name: string; email: string; employeeId: string | null }, input: { documentVersionId: string; certificateId: string; purpose: string }) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`A1_SIGNATURE:${input.documentVersionId}`}))`;
  await db.$queryRaw`SELECT d.id FROM "Document" d JOIN "DocumentVersion" v ON v."documentId"=d.id WHERE v.id=${input.documentVersionId} FOR UPDATE OF d`;
  await db.$queryRaw`SELECT id FROM "DigitalCertificate" WHERE id=${input.certificateId} FOR SHARE`;
  await db.$queryRaw`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR UPDATE`;
  const correlationId = randomUUID();
  const [version, certificate] = await Promise.all([
    db.documentVersion.findUnique({ where: { id: input.documentVersionId }, include: { document: { include: { documentClass: true } }, icpEvidence: true } }),
    db.digitalCertificate.findUnique({ where: { id: input.certificateId } }),
  ]);
  if (!version || version.icpEvidence) throw new Error("Versão inexistente ou já assinada com A1.");
  if (version.status !== "FINAL" || version.lockedAt) throw new Error("Somente uma versão final e desbloqueada pode receber assinatura A1.");
  if (version.document.status !== "Válido") throw new Error("Documento indisponível para assinatura A1.");
  if (version.document.documentClass?.signaturePolicy !== "ICP_REQUIRED") throw new Error("A classe documental não exige assinatura ICP-Brasil.");
  if (!certificate || certificate.status !== "ACTIVE" || certificate.validFrom > new Date() || certificate.validTo < new Date()) throw new Error("Certificado A1 inexistente, inativo ou fora da validade.");
  const purposes = Array.isArray(certificate.purposes) ? certificate.purposes.filter((value): value is string => typeof value === "string") : [];
  if (!purposes.includes(input.purpose)) throw new Error("O certificado não está autorizado para esta finalidade.");
  const intermediatePems = Array.isArray(certificate.intermediatePems) ? certificate.intermediatePems.filter((value): value is string => typeof value === "string") : [];
  const config = resolveReferencedA1Config({ credentialReference: certificate.credentialReference, certificatePem: certificate.certificatePem, intermediateCertificatePems: intermediatePems, trustedRootCertificatePem: certificate.trustedRootPem });
  const evidence = signDocumentHashICPBrasil(version.id, version.hashSha256, config);

  const tx = db;
    const current = await tx.documentVersion.findUnique({ where: { id: version.id }, select: { status: true } });
    if (current?.status !== "FINAL") throw new Error("A versão foi alterada durante a assinatura.");
    const signature = await tx.documentSignature.create({ data: { documentId: version.documentId, documentVersionId: version.id, signerUsuarioId: actor.id, signerEmployeeId: actor.employeeId, signerName: actor.name, signerEmail: actor.email, signatureType: "SIGN", provider: "ICP_BRASIL_A1", isRequired: true, requestedByUsuarioId: actor.id, authenticationMethod: "SESSION_AND_A1_PRIVATE_KEY", reauthenticatedAt: evidence.signedAt, documentHash: version.hashSha256, verificationCode: createPublicValidationCode(), status: "SIGNED", requestedAt: evidence.signedAt, signedAt: evidence.signedAt } });
    await tx.documentIcpEvidence.create({ data: { documentVersionId: version.id, documentSignatureId: signature.id, certificateId: certificate.id, documentHash: evidence.documentHash, canonicalPayload: evidence.canonicalPayload, signatureBase64: evidence.signatureBase64, algorithm: evidence.algorithm, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerial: evidence.certificateSerialNumber, certificateFingerprint: evidence.certificateFingerprint256, certificatePemSnapshot: evidence.certificatePem, intermediatePemsSnapshot: json(intermediatePems), trustedRootPemSnapshot: certificate.trustedRootPem, signedAt: evidence.signedAt, createdByUsuarioId: actor.id } });
    await tx.documentVersion.update({ where: { id: version.id }, data: { status: "SIGNED", lockedAt: evidence.signedAt } });
    await tx.document.update({ where: { id: version.documentId }, data: { status: "Assinado" } });
    await tx.certificateUseAudit.create({ data: { certificateId: certificate.id, documentVersionId: version.id, actorUsuarioId: actor.id, purpose: input.purpose, documentHash: version.hashSha256, correlationId, outcome: "SUCCESS" } });
    return { signatureId: signature.id, correlationId };
}

export async function recordA1Failure(db: PrismaClient, input: { certificateId?: string; documentVersionId?: string; actorUsuarioId: string; purpose: string; errorCode: string }) {
  await db.certificateUseAudit.create({ data: { certificateId: input.certificateId || null, documentVersionId: input.documentVersionId || null, actorUsuarioId: input.actorUsuarioId, purpose: input.purpose, correlationId: randomUUID(), outcome: "FAILURE", errorCode: input.errorCode.slice(0, 80) } });
}
