import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { requestInternalDocumentSignatures } from "@/lib/documents/document-flow-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { assertConstructionGedSignature } from "./construction-documents-service";
import { backupConstructionPdf, readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";
import { renderConstructionTemplate, stampApprovedConstructionProject } from "./construction-documents-policy";

type Db = PrismaClient | Prisma.TransactionClient;
export type ConstructionProjectStampRow = { id: string; requestKey: string; caseId: string; reviewId: string; templateVersionId: string; sourceDocumentId: string; sourceVersionId: string; originalHash: string; originalBackupPath: string; documentId: string; documentVersionId: string; fileUrl: string; hashSha256: string; backupPath: string; validationCode: string; stampSnapshot: Prisma.JsonValue; createdBy: string; createdAt: Date; publishedAt: Date | null };
// Parameterized SQL deliberately supports the additive ledger before the next
// application-wide Prisma regeneration, while all GED CRUD remains native Prisma.
export async function getConstructionProjectStamp(db: Db, id: string) { return (await db.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE id=${id}`)[0] || null; }
export async function listConstructionProjectStamps(db: Db, caseId: string) { return db.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE "caseId"=${caseId} ORDER BY "createdAt" DESC LIMIT 100`; }
export async function findConstructionProjectStampByFile(db: Db, fileUrl: string) { return (await db.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE "fileUrl"=${fileUrl} LIMIT 1`)[0] || null; }
export async function stampConstructionApprovedProject(context: AppContext, access: ConstructionAccess, input: unknown) {
  const data = z.object({ caseId: z.string().min(1), documentId: z.string().min(1), sourceVersionId: z.string().min(1), templateVersionId: z.string().min(1), requestKey: z.uuid(), signerIds: z.array(z.string().min(1)).min(1).max(20) }).parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Carimbo de aprovação exige gestor urbanístico.");
  const row = await context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConstructionCase" WHERE id=${data.caseId} FOR UPDATE`;
    const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, include: { process: { include: { person: true, company: true } } } });
    if (!record || ["Cancelado", "Arquivado", "Rejeitado", "Aguardando Recebimento"].includes(record.process.status)) throw new Error("Solicitação indisponível para carimbo.");
    const replay = (await tx.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE "requestKey"=${data.requestKey}`)[0];
    if (replay) { if (replay.caseId !== record.id || replay.createdBy !== context.user.id || replay.sourceVersionId !== data.sourceVersionId) throw new Error("Chave de carimbo indisponível."); return replay; }
    const review = await tx.constructionReview.findFirst({ where: { caseId: record.id, reviewType: "PROJECT", revision: record.revisionCount }, orderBy: { createdAt: "desc" } });
    if (record.reviewStatus !== "APPROVED" || !review || review.decision !== "APPROVED") throw new Error("Carimbo exige deferimento PROJECT vigente da revisão atual.");
    const evidence = z.object({ documents: z.array(z.object({ id: z.string(), versions: z.array(z.object({ id: z.string() })).optional() })).optional(), documentIds: z.record(z.string(), z.string()).optional() }).passthrough().parse(review.evidenceSnapshot);
    const evidenceDocument = evidence.documents?.find((item) => item.id === data.documentId);
    const allowed = Boolean(evidenceDocument || Object.values(evidence.documentIds || {}).includes(data.documentId));
    if (!allowed) throw new Error("Selecione o PDF utilizado como evidência do deferimento vigente; anotação livre não constitui aprovação.");
    const source = await tx.documentVersion.findFirst({ where: { id: data.sourceVersionId, documentId: data.documentId, status: { in: ["FINAL", "SIGNED"] }, document: { processDocuments: { some: { processId: record.processId } } } } });
    if (!source || (evidenceDocument?.versions?.length && !evidenceDocument.versions.some((version) => version.id === source.id))) throw new Error("Versão PDF difere da evidência do deferimento.");
    const template = await tx.constructionDocumentTemplateVersion.findUnique({ where: { id: data.templateVersionId } });
    if (!template || template.kind !== "PERMIT" || template.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Selecione modelo versionado de alvará com assinatura interna demonstrativa para o carimbo.");
    const duplicate = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ConstructionProjectStamp" WHERE "caseId"=${record.id} AND "sourceVersionId"=${source.id} AND "reviewId"=${review.id}`)[0]; if (duplicate) throw new Error("Esta versão já possui cópia derivada do deferimento.");
    const activeSigners = await tx.usuario.count({ where: { id: { in: [...new Set(data.signerIds)] }, ativo: true } }); if (activeSigners !== new Set(data.signerIds).size) throw new Error("Signatários devem estar ativos.");
    const permit = await tx.constructionIssuedDocument.findFirst({ where: { caseId: record.id, kind: "PERMIT", status: "PUBLISHED" }, orderBy: { createdAt: "desc" } }); if (permit) await assertConstructionGedSignature(tx, permit.documentVersionId);
    const values = { protocol: record.process.protocolNumber, number: permit?.number || `${record.process.protocolNumber} / deferimento ${review.id}`, kind: "Projeto aprovado - cópia derivada demonstrativa", issuedAt: new Date().toISOString().slice(0, 10), totalArea: record.totalArea.toString(), category: record.category, locationType: record.locationType, applicant: record.process.person?.fullName || record.process.company?.corporateName || "Requerente", properties: "Conforme projeto deferido" };
    const original = await readConstructionPdf(source.fileUrl, source.hashSha256); const originalBackup = await backupConstructionPdf(original); const validationCode = randomUUID().replaceAll("-", "");
    const institutionalStamp = renderConstructionTemplate(template.stamp, values);
    const bytes = await stampApprovedConstructionProject(original, { institutionalStamp, protocol: record.process.protocolNumber, reviewReference: `${review.id} (${review.createdAt.toISOString().slice(0, 10)})`, permitNumber: permit?.number || null, validationCode });
    const stored = await storeConstructionPdf(bytes, "projeto-aprovado-copia-derivada.pdf");
    const documentClass = await tx.documentClass.upsert({ where: { code: "CONSTRUCTION_INTERNAL_ALLOWED" }, create: { code: "CONSTRUCTION_INTERNAL_ALLOWED", label: "Construção Civil — demonstrativo interno", signaturePolicy: "INTERNAL_ALLOWED" }, update: {} });
    if (!documentClass.isActive || documentClass.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Classe GED de assinatura interna indisponível.");
    const document = await tx.document.create({ data: { title: `Projeto aprovado — cópia derivada — ${record.process.protocolNumber}`, documentType: "Projeto aprovado demonstrativo", fileUrl: stored.fileUrl, documentClassId: documentClass.id, publicLabel: "Projeto aprovado — cópia derivada demonstrativa interna GED", status: "Válido" } });
    const version = await tx.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode } }); await tx.processDocument.create({ data: { processId: record.processId, documentId: document.id, purpose: "Cópia derivada do projeto aprovado; original preservado" } });
    const id = randomUUID(); const snapshot = JSON.stringify({ templateVersionId: template.id, templateVersion: template.version, institutionalStamp, reviewId: review.id, revision: record.revisionCount, sourceVersionId: source.id, originalHash: source.hashSha256, permitNumber: permit?.number || null, signerIds: [...new Set(data.signerIds)], demonstration: true, derivedCopy: true });
    await tx.$executeRaw`INSERT INTO "ConstructionProjectStamp" (id,"requestKey","caseId","reviewId","templateVersionId","sourceDocumentId","sourceVersionId","originalHash","originalBackupPath","documentId","documentVersionId","fileUrl","hashSha256","backupPath","validationCode","stampSnapshot","createdBy") VALUES (${id},${data.requestKey},${record.id},${review.id},${template.id},${source.documentId},${source.id},${source.hashSha256},${originalBackup.backupPath},${document.id},${version.id},${stored.fileUrl},${stored.hashSha256},${stored.backupPath},${validationCode},${snapshot}::jsonb,${context.user.id})`;
    await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_PROJECT_STAMPED", description: "Cópia derivada demonstrativa do projeto deferido, com carimbo institucional e assinatura GED requerida; original preservado.", departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ projectStampId: id, reviewId: review.id, sourceVersionId: source.id, documentVersionId: version.id }) } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.gedDocumentIngested, targetType: "ConstructionProjectStamp", targetId: id }); return (await getConstructionProjectStamp(tx, id))!;
  }, { timeout: 60000 });
  const version = await context.prisma.documentVersion.findUniqueOrThrow({ where: { id: row.documentVersionId }, select: { status: true } });
  if (version.status === "FINAL") {
    const storedSnapshot = z.object({ signerIds: z.array(z.string()).min(1) }).passthrough().parse(row.stampSnapshot);
    await requestInternalDocumentSignatures(context, row.documentId, storedSnapshot.signerIds, { constructionProjectStampId: row.id, demonstration: "Cópia derivada de projeto; assinatura interna GED" });
  }
  return row.id;
}
export async function assertConstructionProjectStampDownload(db: Db, row: ConstructionProjectStampRow) {
  if (!row.publishedAt) throw new Error("Projeto carimbado aguarda assinaturas e publicação.");
  const version = await assertConstructionGedSignature(db, row.documentVersionId);
  if (version.documentId !== row.documentId || version.hashSha256 !== row.hashSha256 || version.fileUrl !== row.fileUrl) throw new Error("Versão assinada diverge da cópia derivada.");
  return readConstructionPdf(row.fileUrl, row.hashSha256);
}
export async function publishConstructionProjectStamp(context: AppContext, access: ConstructionAccess, id: string) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Publicação do projeto carimbado exige gestor.");
  await context.prisma.$transaction(async (tx) => {
    const row = await getConstructionProjectStamp(tx, id); if (!row) throw new Error("Cópia derivada indisponível.");
    await tx.$queryRaw`SELECT id FROM "ConstructionCase" WHERE id=${row.caseId} FOR UPDATE`;
    const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: row.caseId }, constructionCaseWhere(access)] }, select: { reviewStatus: true, revisionCount: true, processId: true } });
    const review = await tx.constructionReview.findUniqueOrThrow({ where: { id: row.reviewId } });
    if (!record || record.reviewStatus !== "APPROVED" || record.revisionCount !== review.revision || review.decision !== "APPROVED") throw new Error("Deferimento do projeto não está mais vigente.");
    if (row.publishedAt) { await assertConstructionProjectStampDownload(tx, row); return; }
    const version = await assertConstructionGedSignature(tx, row.documentVersionId); if (version.hashSha256 !== row.hashSha256 || version.documentId !== row.documentId) throw new Error("Assinatura não corresponde à cópia derivada."); await readConstructionPdf(row.fileUrl, row.hashSha256);
    await tx.$executeRaw`UPDATE "ConstructionProjectStamp" SET "publishedAt"=CURRENT_TIMESTAMP WHERE id=${id} AND "publishedAt" IS NULL`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProjectStamp", targetId: id });
  }, { timeout: 30000 });
}
