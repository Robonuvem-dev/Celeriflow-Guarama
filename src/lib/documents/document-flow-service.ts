import "server-only";

import { getFile, uploadProcessFile } from "@/lib/platform/blob";
import { getInstanceConfigurationDefaults } from "@/lib/platform/instance-configuration";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { documents } from "@/db/schema/registry";
import { documentClasses, documentVersions, documentSignatures, documentIcpEvidence } from "@/db/schema/document-workflow";
import { processes, processDocuments, processEvents } from "@/db/schema/processes";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { users } from "@/db/schema/identity";
import type { AppContext } from "@/lib/platform/tenant-context";
import { notifyProtocolUsers } from "@/lib/protocols/notifications";
import { verifyDocumentHashICPBrasil, type DocumentHashSignatureResult } from "@/lib/security/icp-brasil";
import {
  assertInternalSigningAllowed,
  createPublicValidationCode,
  getVersionSignatureStatus,
  hashDocumentContent,
  snapshotRetentionMonths,
  toPublicValidationResponse,
} from "./document-flow-policy";

type Db = DatabaseExecutor;

type SignatureAudit = {
  ipAddress: string | null;
  userAgent: string | null;
};

async function hashStoredFile(fileUrl: string) {
  const file = await getFile(fileUrl);
  if (!file?.stream) throw new Error("O arquivo original nao esta disponivel para gerar o hash.");
  return hashDocumentContent(new Uint8Array(await new Response(file.stream).arrayBuffer()));
}

async function getConfiguredRetentionMonths(db: Db) {
  const [parameter] = await db.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, "DOCUMENT_DEFAULT_RETENTION_MONTHS")).orderBy(asc(instanceParameters.createdAt)).limit(1);
  const configured = typeof parameter?.valor === "number"
    ? parameter.valor
    : getInstanceConfigurationDefaults().DOCUMENT_DEFAULT_RETENTION_MONTHS;
  return snapshotRetentionMonths(configured);
}

export async function ingestGedDocument(
  db: DatabaseConnection,
  input: {
    title: string;
    documentType: string;
    documentClassCode: string;
    fileUrl: string;
    folderId?: string | null;
    publicLabel?: string;
    content?: string | Uint8Array;
    actorUsuarioId: string;
    afterCreate?: (tx: DatabaseTransaction, documentId: string) => Promise<void>;
  },
) {
  const hashSha256 = input.content !== undefined ? hashDocumentContent(input.content) : await hashStoredFile(input.fileUrl);

  return withDatabaseTransaction(db, async (tx) => {
    const [documentClass, retentionMonths] = await Promise.all([
      tx.select({ id: documentClasses.id }).from(documentClasses).where(and(eq(documentClasses.code, input.documentClassCode), eq(documentClasses.isActive, true))).limit(1).then(rows => rows[0]),
      getConfiguredRetentionMonths(tx),
    ]);
    if (!documentClass) throw new Error("A classe documental selecionada nao esta ativa.");

    const [document] = await tx.insert(documents).values({
        title: input.title.trim(),
        documentType: input.documentType,
        documentClassId: documentClass.id,
        fileUrl: input.fileUrl,
        folderId: input.folderId ?? null,
        publicLabel: input.publicLabel?.trim() || "Documento autenticado",
        retentionMonths,
        status: "Válido",
    }).returning({ id: documents.id });
    const [version] = await tx.insert(documentVersions).values({
        documentId: document.id,
        versionNumber: 1,
        fileUrl: input.fileUrl,
        hashSha256,
        publicValidationCode: createPublicValidationCode(),
        status: "FINAL",
    }).returning({ id: documentVersions.id, versionNumber: documentVersions.versionNumber, hashSha256: documentVersions.hashSha256, publicValidationCode: documentVersions.publicValidationCode });
    if (input.afterCreate) await input.afterCreate(tx, document.id);
    await insertAuditEvent(tx, {
      actorUsuarioId: input.actorUsuarioId,
      eventType: auditEventTypes.gedDocumentIngested,
      targetType: "DOCUMENT",
      targetId: document.id,
    });
    return { documentId: document.id, version };
  }, { timeoutMs: 5_000 });
}

export async function ingestProcessDocument(
  context: AppContext,
  input: {
    processId: string;
    employeeId: string;
    departmentId: string;
    title: string;
    documentType: string;
    documentClassId: string;
    file: File;
  },
) {
  const blob = await uploadProcessFile(input.file);
  const content = new Uint8Array(await input.file.arrayBuffer());
  const hashSha256 = hashDocumentContent(content);

  return withDatabaseTransaction(databaseConnection, async (tx) => {
    const [process] = await tx.select({ id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status }).from(processes).where(and(eq(processes.id, input.processId), eq(processes.currentDepartmentId, input.departmentId))).limit(1);
    if (!process) throw new Error("Processo nao encontrado ou sem acesso ao seu setor.");
    if (["Aguardando Recebimento", "Arquivado", "Cancelado"].includes(process.status)) {
      throw new Error("Este processo nao aceita anexos neste momento.");
    }

    const [documentClass, retentionMonths] = await Promise.all([
      tx.select({ id: documentClasses.id }).from(documentClasses).where(and(eq(documentClasses.id, input.documentClassId), eq(documentClasses.isActive, true), eq(documentClasses.signaturePolicy, "INTERNAL_ALLOWED"))).limit(1).then(rows => rows[0]),
      getConfiguredRetentionMonths(tx),
    ]);
    if (!documentClass) throw new Error("Selecione uma classe documental ativa com assinatura interna permitida.");

    const [document] = await tx.insert(documents).values({
        title: input.title.trim(),
        documentType: input.documentType,
        fileUrl: blob.url,
        status: "Válido",
        notes: `Anexo do processo ${process.protocolNumber}.`,
        documentClassId: documentClass.id,
        retentionMonths,
    }).returning({ id: documents.id });
    await tx.insert(documentVersions).values({
        documentId: document.id,
        versionNumber: 1,
        fileUrl: blob.url,
        hashSha256,
        publicValidationCode: createPublicValidationCode(),
        status: "FINAL",
    });
    await tx.insert(processDocuments).values({ processId: process.id, documentId: document.id, purpose: input.documentType, employeeId: input.employeeId });
    await tx.insert(processEvents).values({
        processId: process.id,
        eventType: "DOCUMENT_ADDED",
        description: "Documento anexado ao processo e registrado no GED.",
        departmentId: input.departmentId,
        employeeId: input.employeeId,
    });
    await insertAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.gedDocumentIngested,
      targetType: "DOCUMENT",
      targetId: document.id,
    });
    await insertAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.processDocumentLinked,
      targetType: "PROCESS",
      targetId: process.id,
    });
    return { documentId: document.id };
  }, { timeoutMs: 5_000 });
}

async function createInternalDocumentSignatures(
  tx: DatabaseTransaction,
  actorUsuarioId: string,
  documentId: string,
  signerUsuarioIds: string[],
  metadata?: Record<string, string | number>,
) {
  const uniqueSignerIds = [...new Set(signerUsuarioIds.filter(Boolean))];
  if (uniqueSignerIds.length === 0) throw new Error("Selecione pelo menos um signatario interno.");

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${documentId}`}))`);
  const [document] = await tx.select({ id: documents.id, signaturePolicy: documentClasses.signaturePolicy }).from(documents).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(eq(documents.id, documentId)).limit(1);
  if (!document) throw new Error("Documento nao encontrado.");
  assertInternalSigningAllowed(document.signaturePolicy);
  const [version] = await tx.select({ id: documentVersions.id, hashSha256: documentVersions.hashSha256, publicValidationCode: documentVersions.publicValidationCode }).from(documentVersions).where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.status, "FINAL"), isNull(documentVersions.lockedAt), typeof metadata?.planningDocumentVersionId === "string" ? eq(documentVersions.id, metadata.planningDocumentVersionId) : undefined)).orderBy(desc(documentVersions.versionNumber)).limit(1);
  if (!version) throw new Error("O documento nao possui uma versao final disponivel para assinatura.");

  const signers = await tx.select({ id: users.id, nome: users.nome, email: users.email, employeeId: users.employeeId }).from(users).where(and(inArray(users.id, uniqueSignerIds), eq(users.ativo, true)));
  if (signers.length !== uniqueSignerIds.length) throw new Error("Um ou mais signatarios internos nao estao ativos.");

  const requestedAt = new Date();
  await tx.update(documentVersions).set({ status: "PENDING_SIGNATURE", lockedAt: requestedAt }).where(eq(documentVersions.id, version.id));
  await tx.insert(documentSignatures).values(signers.map((signer) => ({
      documentId: document.id,
      documentVersionId: version.id,
      signerUsuarioId: signer.id,
      signerEmployeeId: signer.employeeId,
      signerName: signer.nome,
      signerEmail: signer.email,
      requestedByUsuarioId: actorUsuarioId,
      isRequired: true,
      authenticationMethod: "PENDING_REAUTHENTICATION",
      documentHash: version.hashSha256,
      verificationCode: createPublicValidationCode(),
      status: "PENDING",
      requestedAt,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })));
  await tx.update(documents).set({ status: "Pendente Assinatura" }).where(eq(documents.id, document.id));
  await insertAuditEvent(tx, {
    actorUsuarioId,
    eventType: auditEventTypes.documentSignatureRequested,
    targetType: "DOCUMENT",
    targetId: document.id,
  });
  return {
    documentId: document.id,
    documentVersionId: version.id,
    publicValidationCode: version.publicValidationCode,
    signerIds: signers.map((signer) => signer.id),
    qrValidationUrl: `${process.env.CELERIFLOW_PUBLIC_BASE_URL?.replace(/\/$/, "") || ""}/validar-documento/${version.publicValidationCode}`,
  };
}

export async function requestInternalDocumentSignatures(
  context: AppContext,
  documentId: string,
  signerUsuarioIds: string[],
  metadata?: Record<string, string | number>,
) {
  return withDatabaseTransaction(databaseConnection, (tx) => createInternalDocumentSignatures(tx, context.user.id, documentId, signerUsuarioIds, metadata), { timeoutMs: 5_000 });
}

// Background/domain issuers use the same GED signature request implementation
// without fabricating a session context. The caller authorizes the domain action.
export async function requestDocumentSignaturesForActor(db: DatabaseConnection, actorUsuarioId: string, documentId: string, signerUsuarioIds: string[], metadata?: Record<string, string | number>) {
  return withDatabaseTransaction(db, (tx) => createInternalDocumentSignatures(tx, actorUsuarioId, documentId, signerUsuarioIds, metadata), { timeoutMs: 5_000 });
}

export async function requestProcessDocumentSignatures(
  context: AppContext,
  input: { processId: string; departmentId: string; employeeId: string; documentId: string; signerUsuarioIds: string[] },
) {
  return withDatabaseTransaction(databaseConnection, async (tx) => {
    const [processDocument] = await tx.select({ processId: processDocuments.processId, protocolNumber: processes.protocolNumber, status: processes.status }).from(processDocuments).innerJoin(processes, eq(processes.id, processDocuments.processId)).innerJoin(documents, eq(documents.id, processDocuments.documentId)).where(and(eq(processDocuments.processId, input.processId), eq(processDocuments.documentId, input.documentId), eq(processes.currentDepartmentId, input.departmentId))).limit(1);
    if (!processDocument) throw new Error("Documento do processo nao encontrado ou sem acesso ao seu setor.");
    if (["Aguardando Recebimento", "Arquivado", "Cancelado"].includes(processDocument.status)) {
      throw new Error("Este processo nao aceita solicitacoes de assinatura neste momento.");
    }
    const result = await createInternalDocumentSignatures(tx, context.user.id, input.documentId, input.signerUsuarioIds);
    const notification = await notifyProtocolUsers(tx, context.user.id, result.signerIds, {
      processId: input.processId,
      type: "SIGNATURE_REQUESTED",
      title: `Assinatura solicitada: ${processDocument.protocolNumber}`,
      message: "Ha um documento do processo aguardando sua assinatura interna.",
      priority: "ALTA",
      dedupeDiscriminator: result.documentVersionId,
    });
    if (notification.created !== result.signerIds.length) {
      throw new Error("Todos os signatarios precisam ter acesso ao modulo de Processos para receber a solicitacao.");
    }
    await tx.insert(processEvents).values({
        processId: input.processId,
        eventType: "SIGNATURE_REQUESTED",
        description: "Assinaturas internas solicitadas para documento do processo.",
        departmentId: input.departmentId,
        employeeId: input.employeeId,
    });
    await insertAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.processUpdated,
      targetType: "PROCESS",
      targetId: input.processId,
    });
    return result;
  }, { timeoutMs: 5_000 });
}

export async function registerRequestedInternalDocumentSignature(
  context: AppContext,
  documentId: string,
  audit: SignatureAudit,
  reauthenticatedAt: Date,
) {
  return withDatabaseTransaction(databaseConnection, async (tx) => {
    const [pendingSignature] = await tx.select({ id: documentSignatures.id, documentVersionId: documentSignatures.documentVersionId, metadata: documentSignatures.metadata, versionStatus: documentVersions.status, signaturePolicy: documentClasses.signaturePolicy }).from(documentSignatures).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(and(eq(documentSignatures.documentId, documentId), eq(documentSignatures.signerUsuarioId, context.user.id), eq(documentSignatures.status, "PENDING"))).limit(1);
    if (!pendingSignature) throw new Error("Nenhuma solicitacao de assinatura pendente foi encontrada para este documento.");
    assertInternalSigningAllowed(pendingSignature.signaturePolicy);
    if (pendingSignature.versionStatus !== "PENDING_SIGNATURE") throw new Error("A versao solicitada nao esta disponivel para assinatura.");

    const [signature] = await tx.update(documentSignatures).set({
        authenticationMethod: "FIREBASE_PASSWORD_REAUTH",
        reauthenticatedAt,
        status: "SIGNED",
        signedAt: reauthenticatedAt,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        metadata: JSON.stringify({
          ...(pendingSignature.metadata ? JSON.parse(pendingSignature.metadata) as Record<string, unknown> : {}),
          documentId,
          documentVersionId: pendingSignature.documentVersionId,
          signatureId: pendingSignature.id,
        }),
    }).where(eq(documentSignatures.id, pendingSignature.id)).returning({ id: documentSignatures.id, verificationCode: documentSignatures.verificationCode });
    const signatures = await tx.select({ status: documentSignatures.status, isRequired: documentSignatures.isRequired }).from(documentSignatures).where(eq(documentSignatures.documentVersionId, pendingSignature.documentVersionId));
    const versionStatus = getVersionSignatureStatus(signatures);
    if (versionStatus === "SIGNED") {
      await tx.update(documentVersions).set({ status: "SIGNED" }).where(eq(documentVersions.id, pendingSignature.documentVersionId));
      await tx.update(documents).set({ status: "Assinado" }).where(eq(documents.id, documentId));
    }
    await insertAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.documentSignatureRegistered,
      targetType: "DOCUMENT_SIGNATURE",
      targetId: signature.id,
    });
    return { ...signature, versionStatus };
  }, { timeoutMs: 5_000 });
}

export async function findPublicDocumentValidation(db: DatabaseExecutor, code: string) {
  const [version] = await db.select({ versionNumber: documentVersions.versionNumber, hashSha256: documentVersions.hashSha256, status: documentVersions.status, publicLabel: documents.publicLabel, icpEvidence: documentIcpEvidence }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentIcpEvidence, eq(documentIcpEvidence.documentVersionId, documentVersions.id)).where(eq(documentVersions.publicValidationCode, code)).limit(1);
  if (!version) return null;
  const base = toPublicValidationResponse({
    publicLabel: version.publicLabel,
    versionNumber: version.versionNumber,
    hashSha256: version.hashSha256,
    status: version.status,
  });
  if (!version.icpEvidence) return { ...base, signature: { kind: version.status === "SIGNED" ? "INTERNAL" : "UNSIGNED", valid: version.status === "SIGNED" } };
  const intermediateCertificatePems = Array.isArray(version.icpEvidence.intermediatePemsSnapshot) ? version.icpEvidence.intermediatePemsSnapshot.filter((value): value is string => typeof value === "string") : [];
  const result: DocumentHashSignatureResult = { documentVersionId: version.icpEvidence.documentVersionId, documentHash: version.icpEvidence.documentHash, canonicalPayload: version.icpEvidence.canonicalPayload, signatureBase64: version.icpEvidence.signatureBase64, algorithm: "SHA256", signedAt: version.icpEvidence.signedAt, certificateSubject: version.icpEvidence.certificateSubject, certificateIssuer: version.icpEvidence.certificateIssuer, certificateSerialNumber: version.icpEvidence.certificateSerial, certificateFingerprint256: version.icpEvidence.certificateFingerprint, certificatePem: version.icpEvidence.certificatePemSnapshot };
  const valid = version.hashSha256 === version.icpEvidence.documentHash && verifyDocumentHashICPBrasil(result, { intermediateCertificatePems, trustedRootCertificatePem: version.icpEvidence.trustedRootPemSnapshot });
  return { ...base, signature: { kind: valid ? "ICP_A1_VALID" : "ICP_A1_INVALID", valid, signedAt: version.icpEvidence.signedAt.toISOString(), subject: version.icpEvidence.certificateSubject, issuer: version.icpEvidence.certificateIssuer, serialNumber: version.icpEvidence.certificateSerial, fingerprint256: version.icpEvidence.certificateFingerprint } };
}
