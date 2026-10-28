import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { constructionReviews } from "@/db/schema/construction-core";
import { constructionDocumentTemplateVersions, constructionIssuedDocuments, constructionProjectStamps } from "@/db/schema/construction-documents";
import { documentClasses, documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { processDocuments, processEvents } from "@/db/schema/processes";
import { users } from "@/db/schema/identity";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import type { ConstructionAccess } from "./construction-policy";
import { assertConstructionGedSignature } from "./construction-documents-service";
import { backupConstructionPdf, readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";
import { renderConstructionTemplate, stampApprovedConstructionProject } from "./construction-documents-policy";

export type ConstructionProjectStampRow = typeof constructionProjectStamps.$inferSelect;
export async function getConstructionProjectStamp(db: DatabaseExecutor, id: string) { return (await db.select().from(constructionProjectStamps).where(eq(constructionProjectStamps.id, id)).limit(1))[0] || null; }
export async function listConstructionProjectStamps(db: DatabaseExecutor, caseId: string) { return db.select().from(constructionProjectStamps).where(eq(constructionProjectStamps.caseId, caseId)).orderBy(desc(constructionProjectStamps.createdAt)).limit(100); }
export async function findConstructionProjectStampByFile(db: DatabaseExecutor, fileUrl: string) { return (await db.select().from(constructionProjectStamps).where(eq(constructionProjectStamps.fileUrl, fileUrl)).limit(1))[0] || null; }
export async function stampConstructionApprovedProject(context: AppContext, access: ConstructionAccess, input: unknown, connection: DatabaseConnection = databaseConnection) {
  const data = z.object({ caseId: z.string().min(1), documentId: z.string().min(1), sourceVersionId: z.string().min(1), templateVersionId: z.string().min(1), requestKey: z.uuid(), signerIds: z.array(z.string().min(1)).min(1).max(20) }).parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Carimbo de aprovação exige gestor urbanístico.");
  const row = await withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "ConstructionCase" WHERE id=${data.caseId} FOR UPDATE`);
    const record = await findConstructionCaseForAccess(tx, data.caseId, access);
    if (!record || ["Cancelado", "Arquivado", "Rejeitado", "Aguardando Recebimento"].includes(record.process.status)) throw new Error("Solicitação indisponível para carimbo.");
    const [replay] = await tx.select().from(constructionProjectStamps).where(eq(constructionProjectStamps.requestKey, data.requestKey)).limit(1);
    if (replay) { if (replay.caseId !== record.id || replay.createdBy !== context.user.id || replay.sourceVersionId !== data.sourceVersionId) throw new Error("Chave de carimbo indisponível."); return replay; }
    const [review] = await tx.select().from(constructionReviews).where(and(eq(constructionReviews.caseId, record.id), eq(constructionReviews.reviewType, "PROJECT"), eq(constructionReviews.revision, record.revisionCount))).orderBy(desc(constructionReviews.createdAt)).limit(1);
    if (record.reviewStatus !== "APPROVED" || !review || review.decision !== "APPROVED") throw new Error("Carimbo exige deferimento PROJECT vigente da revisão atual.");
    const evidence = z.object({ documents: z.array(z.object({ id: z.string(), versions: z.array(z.object({ id: z.string() })).optional() })).optional(), documentIds: z.record(z.string(), z.string()).optional() }).passthrough().parse(review.evidenceSnapshot);
    const evidenceDocument = evidence.documents?.find((item) => item.id === data.documentId);
    const allowed = Boolean(evidenceDocument || Object.values(evidence.documentIds || {}).includes(data.documentId));
    if (!allowed) throw new Error("Selecione o PDF utilizado como evidência do deferimento vigente; anotação livre não constitui aprovação.");
    const [source] = await tx.select().from(documentVersions).where(and(eq(documentVersions.id, data.sourceVersionId), eq(documentVersions.documentId, data.documentId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), exists(tx.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documentVersions.documentId), eq(processDocuments.processId, record.processId)))))).limit(1);
    if (!source || (evidenceDocument?.versions?.length && !evidenceDocument.versions.some((version) => version.id === source.id))) throw new Error("Versão PDF difere da evidência do deferimento.");
    const [template] = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.id, data.templateVersionId)).limit(1);
    if (!template || template.kind !== "PERMIT" || template.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Selecione modelo versionado de alvará com assinatura interna demonstrativa para o carimbo.");
    const [duplicate] = await tx.select({ id: constructionProjectStamps.id }).from(constructionProjectStamps).where(and(eq(constructionProjectStamps.caseId, record.id), eq(constructionProjectStamps.sourceVersionId, source.id), eq(constructionProjectStamps.reviewId, review.id))).limit(1); if (duplicate) throw new Error("Esta versão já possui cópia derivada do deferimento.");
    const activeSigners = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, [...new Set(data.signerIds)]), eq(users.ativo, true))); if (activeSigners.length !== new Set(data.signerIds).size) throw new Error("Signatários devem estar ativos.");
    const [permit] = await tx.select().from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.kind, "PERMIT"), eq(constructionIssuedDocuments.status, "PUBLISHED"))).orderBy(desc(constructionIssuedDocuments.createdAt)).limit(1); if (permit) await assertConstructionGedSignature(tx, permit.documentVersionId);
    const values = { protocol: record.process.protocolNumber, number: permit?.number || `${record.process.protocolNumber} / deferimento ${review.id}`, kind: "Projeto aprovado - cópia derivada demonstrativa", issuedAt: new Date().toISOString().slice(0, 10), totalArea: record.totalArea.toString(), category: record.category, locationType: record.locationType, applicant: record.process.person?.fullName || record.process.company?.corporateName || "Requerente", properties: "Conforme projeto deferido" };
    const original = await readConstructionPdf(source.fileUrl, source.hashSha256); const originalBackup = await backupConstructionPdf(original); const validationCode = randomUUID().replaceAll("-", "");
    const institutionalStamp = renderConstructionTemplate(template.stamp, values);
    const bytes = await stampApprovedConstructionProject(original, { institutionalStamp, protocol: record.process.protocolNumber, reviewReference: `${review.id} (${review.createdAt.toISOString().slice(0, 10)})`, permitNumber: permit?.number || null, validationCode });
    const stored = await storeConstructionPdf(bytes, "projeto-aprovado-copia-derivada.pdf");
    await tx.insert(documentClasses).values({ code: "CONSTRUCTION_INTERNAL_ALLOWED", label: "Construção Civil — demonstrativo interno", signaturePolicy: "INTERNAL_ALLOWED" }).onConflictDoNothing({ target: documentClasses.code });
    const [documentClass] = await tx.select().from(documentClasses).where(eq(documentClasses.code, "CONSTRUCTION_INTERNAL_ALLOWED")).limit(1);
    if (!documentClass.isActive || documentClass.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Classe GED de assinatura interna indisponível.");
    const [document] = await tx.insert(documents).values({ title: `Projeto aprovado — cópia derivada — ${record.process.protocolNumber}`, documentType: "Projeto aprovado demonstrativo", fileUrl: stored.fileUrl, documentClassId: documentClass.id, publicLabel: "Projeto aprovado — cópia derivada demonstrativa interna GED", status: "Válido" }).returning();
    const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode }).returning(); await tx.insert(processDocuments).values({ processId: record.processId, documentId: document.id, purpose: "Cópia derivada do projeto aprovado; original preservado" });
    const id = randomUUID(); const snapshot = { templateVersionId: template.id, templateVersion: template.version, institutionalStamp, reviewId: review.id, revision: record.revisionCount, sourceVersionId: source.id, originalHash: source.hashSha256, permitNumber: permit?.number || null, signerIds: [...new Set(data.signerIds)], demonstration: true, derivedCopy: true };
    await tx.insert(constructionProjectStamps).values({ id, requestKey: data.requestKey, caseId: record.id, reviewId: review.id, templateVersionId: template.id, sourceDocumentId: source.documentId, sourceVersionId: source.id, originalHash: source.hashSha256, originalBackupPath: originalBackup.backupPath, documentId: document.id, documentVersionId: version.id, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, backupPath: stored.backupPath, validationCode, stampSnapshot: snapshot, createdBy: context.user.id });
    await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_PROJECT_STAMPED", description: "Cópia derivada demonstrativa do projeto deferido, com carimbo institucional e assinatura GED requerida; original preservado.", departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ projectStampId: id, reviewId: review.id, sourceVersionId: source.id, documentVersionId: version.id }) });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.gedDocumentIngested, targetType: "ConstructionProjectStamp", targetId: id }); return (await getConstructionProjectStamp(tx, id))!;
  }, { timeoutMs: 60000 });
  const [version] = await connection.db.select({ status: documentVersions.status }).from(documentVersions).where(eq(documentVersions.id, row.documentVersionId)).limit(1);
  if (version.status === "FINAL") {
    const storedSnapshot = z.object({ signerIds: z.array(z.string()).min(1) }).passthrough().parse(row.stampSnapshot);
    await requestDocumentSignaturesForActor(connection, context.user.id, row.documentId, storedSnapshot.signerIds, { constructionProjectStampId: row.id, demonstration: "Cópia derivada de projeto; assinatura interna GED" });
  }
  return row.id;
}
export async function assertConstructionProjectStampDownload(db: DatabaseExecutor, row: ConstructionProjectStampRow) {
  if (!row.publishedAt) throw new Error("Projeto carimbado aguarda assinaturas e publicação.");
  const version = await assertConstructionGedSignature(db, row.documentVersionId);
  if (version.documentId !== row.documentId || version.hashSha256 !== row.hashSha256 || version.fileUrl !== row.fileUrl) throw new Error("Versão assinada diverge da cópia derivada.");
  return readConstructionPdf(row.fileUrl, row.hashSha256);
}
export async function publishConstructionProjectStamp(context: AppContext, access: ConstructionAccess, id: string, connection: DatabaseConnection = databaseConnection) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Publicação do projeto carimbado exige gestor.");
  await withDatabaseTransaction(connection, async (tx) => {
    const row = await getConstructionProjectStamp(tx, id); if (!row) throw new Error("Cópia derivada indisponível.");
    await tx.execute(sql`SELECT id FROM "ConstructionCase" WHERE id=${row.caseId} FOR UPDATE`);
    const record = await findConstructionCaseForAccess(tx, row.caseId, access);
    const [review] = await tx.select().from(constructionReviews).where(eq(constructionReviews.id, row.reviewId)).limit(1); if (!review) throw new Error("ConstructionReview não encontrado.");
    if (!record || record.reviewStatus !== "APPROVED" || record.revisionCount !== review.revision || review.decision !== "APPROVED") throw new Error("Deferimento do projeto não está mais vigente.");
    if (row.publishedAt) { await assertConstructionProjectStampDownload(tx, row); return; }
    const version = await assertConstructionGedSignature(tx, row.documentVersionId); if (version.hashSha256 !== row.hashSha256 || version.documentId !== row.documentId) throw new Error("Assinatura não corresponde à cópia derivada."); await readConstructionPdf(row.fileUrl, row.hashSha256);
    await tx.execute(sql`UPDATE "ConstructionProjectStamp" SET "publishedAt"=CURRENT_TIMESTAMP WHERE id=${id} AND "publishedAt" IS NULL`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProjectStamp", targetId: id });
  }, { timeoutMs: 30000 });
}
