import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { inDatabaseTransactionScope } from "@/db/transaction-scope";
import { documents } from "@/db/schema/registry";
import { documentClasses, documentFolders, documentVersions } from "@/db/schema/document-workflow";
import { users } from "@/db/schema/identity";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { gedCheckouts, gedDecisions, gedEntries, gedFolderAccess, gedGenerated, gedJobs, gedPages, gedReviews, gedSmartFolders, gedTemplates, gedThesaurus, gedUploads, gedVersionFiles, gedCentralSignatures, type GedReviewAssignments } from "@/db/schema/ged-management";
import { centralRecords } from "@/db/schema/signature-central";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { canUseGed, requireGedObject, gedObjectScope, gedEntryScope } from "./ged-access";
import { gedMetadata, gedTypeDefinitions } from "@/db/schema/ged-poc";
import { validateIndexValues } from "./ged-admin-policy";
import { createPublicValidationCode, snapshotRetentionMonths } from "./document-flow-policy";
import { fillGedTemplate, gedQuerySchema, gedStages, gedStageLabels, gedZoneSchema, normalizeGedText, templateMarkers, type GedCapability } from "./ged-policy";
import { extractGedText, gedUploadPath, inspectGedBytes, readGedBytes, requestGedOcr } from "./ged-storage";
import { uploadFile } from "@/lib/platform/blob";
import type { AppContext } from "@/lib/platform/tenant-context";
import type { GedDetail } from "@/lib/contracts/ged";

function authorize(context: AppContext, capability: GedCapability) {
  if (!canUseGed(context.user, capability)) throw new Error("Sem permissão para esta operação documental.");
}
function transact<T>(context: AppContext, operation: (tx: DatabaseTransaction) => Promise<T>) {
  const connection = (context as AppContext & { databaseConnection?: DatabaseConnection }).databaseConnection ?? databaseConnection;
  if (context.database && context.database !== connection.db) throw new Error("Conexão incompatível com o contexto documental.");
  return withDatabaseTransaction(connection, operation);
}
async function retentionMonths(tx: DatabaseTransaction) {
  const [parameter] = await tx.select({ value: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, "DOCUMENT_DEFAULT_RETENTION_MONTHS")).orderBy(instanceParameters.createdAt).limit(1);
  const { getInstanceConfigurationDefaults } = await import("@/lib/platform/instance-configuration");
  return snapshotRetentionMonths(typeof parameter?.value === "number" ? parameter.value : getInstanceConfigurationDefaults().DOCUMENT_DEFAULT_RETENTION_MONTHS);
}
async function lockDocument(tx: DatabaseTransaction, id: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${id}`}))`);
  const lease = await tx.execute(sql`SELECT 1 FROM "GedOperationLease" WHERE "documentId"=${id} AND "expiresAt">now()`);
  if (lease.rows.length) throw new Error("Documento em assinatura na Central. Repita após a conclusão.");
}
async function audit(tx: DatabaseTransaction, context: AppContext, targetId: string, kind: string) {
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: `GED_${kind}`, targetId });
  await tx.execute(sql`INSERT INTO "GedActivity"(id,"documentId","actorId",kind,detail) SELECT ${randomUUID()},e."documentId",${context.user.id},${kind},jsonb_build_object('target',${targetId}::text) FROM "GedEntry" e WHERE e."documentId"=${targetId} OR e."documentId" IN (SELECT "documentId" FROM "DocumentVersion" WHERE id=${targetId}) OR e."documentId" IN (SELECT "documentId" FROM "GedReview" WHERE id=${targetId})`);
  if (kind === "IMPORT" || kind === "CHECKIN") await tx.execute(sql`INSERT INTO "GedEventQueue"(id,"documentId",event) VALUES(${randomUUID()},${targetId},${kind})`);
  if (kind === "REVIEW_DECISION") await tx.execute(sql`INSERT INTO "GedEventQueue"(id,"documentId",event) SELECT ${randomUUID()},e."documentId",'HOMOLOGATED' FROM "GedEntry" e JOIN "GedReview" r ON r."documentId"=e."documentId" WHERE r.id=${targetId} AND e."editorialStatus"='HOMOLOGADO'`);
}
async function checkFolder(context: AppContext, folderId: string | null, tx = context.database ?? db) {
  if (!folderId) return;
  await requireGedObject(context, "folder", folderId, "import", tx);
}

export const gedUploadSchema = z.object({
  id: z.uuid(), batchId: z.uuid(), filename: z.string().min(1).max(250), title: z.string().trim().min(1).max(250),
  classCode: z.string().min(1).max(100), folderId: z.string().max(100).nullable().default(null),
  folderPath: z.array(z.string().trim().min(1).max(150)).max(20).default([]),
  legacyReference: z.string().max(300).default(""), checkinDocumentId: z.string().max(100).nullable().default(null),
  indexValues: z.record(z.string(), z.unknown()).default({}),
});
export async function prepareGedUpload(context: AppContext, raw: unknown) {
  const input = gedUploadSchema.parse(raw);
  authorize(context, input.checkinDocumentId ? "edit" : "import");
  await checkFolder(context, input.folderId);
  let folderId = input.folderId;
  if (input.folderPath.length && !input.checkinDocumentId) {
    folderId = await transact(context, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('GED_FOLDER_TREE'))`);
      let parent = input.folderId;
      for (const part of input.folderPath) {
        if (part === "." || part === "..") throw new Error("Caminho de pasta inválido.");
        const [existing] = await tx.select({ id: documentFolders.id }).from(documentFolders).innerJoin(gedFolderAccess, eq(gedFolderAccess.folderId, documentFolders.id)).where(and(eq(documentFolders.name, part), parent ? eq(documentFolders.parentId, parent) : isNull(documentFolders.parentId), sql`(${gedFolderAccess.ownerId}=${context.user.id} OR (${gedFolderAccess.departmentId} IS NOT NULL AND ${gedFolderAccess.departmentId}=${context.user.departmentId}))`)).limit(1);
        if (existing) parent = existing.id;
        else {
          const [created] = await tx.insert(documentFolders).values({ name: part, parentId: parent, departmentId: context.user.departmentId }).returning({ id: documentFolders.id });
          await tx.insert(gedFolderAccess).values({ folderId: created.id, ownerId: context.user.id, departmentId: context.user.departmentId });
          parent = created.id;
        }
      }
      return parent;
    });
  }
  if (input.checkinDocumentId) {
    await requireGedObject(context, "document", input.checkinDocumentId, "edit");
    const document = await requireManagedDocument(context, input.checkinDocumentId);
    if (document.checkoutOwnerId !== context.user.id) throw new Error("Retire o documento para edição antes do check-in.");
  }
  const pathname = gedUploadPath(context.user.id, input.id, input.filename);
  const definitionRows = input.checkinDocumentId ? { rows: [] } : await (context.database ?? db).execute<{ id: string; fields: Parameters<typeof validateIndexValues>[0] }>(sql`SELECT t.id,t.fields FROM "GedTypeDefinition" t JOIN "DocumentClass" c ON c.id=t."classId" WHERE c.code=${input.classCode} ORDER BY t.version DESC LIMIT 1`);
  const definition = definitionRows.rows[0]; const indexValues = validateIndexValues(definition?.fields ?? [], input.indexValues);
  await (context.database ?? db).insert(gedUploads).values({ id: input.id, batchId: input.batchId, filename: input.filename, title: input.title, classCode: input.classCode, legacyReference: input.legacyReference, checkinDocumentId: input.checkinDocumentId, folderId, ownerId: context.user.id, pathname, indexValues, definitionId: definition?.id ?? null }).onConflictDoNothing();
  const [saved] = await (context.database ?? db).select().from(gedUploads).where(eq(gedUploads.id, input.id));
  const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  if (!saved || saved.ownerId !== context.user.id || saved.pathname !== pathname || saved.title !== input.title || saved.classCode !== input.classCode || saved.folderId !== folderId || saved.checkinDocumentId !== input.checkinDocumentId || saved.batchId !== input.batchId || saved.legacyReference !== input.legacyReference || canonical(saved.indexValues) !== canonical(indexValues)) throw new Error("A chave de upload já pertence a outra operação.");
  return saved;
}

export async function resumeGedUpload(context: AppContext, id: string) {
  const [row] = await (context.database ?? db).select().from(gedUploads).where(and(eq(gedUploads.id, id), eq(gedUploads.ownerId, context.user.id)));
  if (!row) return { url: null, documentId: null };
  authorize(context, row.checkinDocumentId ? "edit" : "import");
  if (row.url || row.documentId) return { url: row.url, documentId: row.documentId };
  const { head } = await import("@vercel/blob");
  try {
    const stored = await head(row.pathname);
    if (stored.pathname !== row.pathname) throw new Error("Arquivo fora da intenção registrada.");
    return { url: stored.url, documentId: null };
  } catch (error) {
    if (error instanceof Error && error.name === "BlobNotFoundError") return { url: null, documentId: null };
    throw error;
  }
}
export async function completeGedUpload(id: string, ownerId: string, pathname: string, url: string) {
  const [row] = await db.select().from(gedUploads).where(and(eq(gedUploads.id, id), eq(gedUploads.ownerId, ownerId)));
  if (!row || row.pathname !== pathname) throw new Error("O upload não corresponde à intenção registrada.");
  if (row.status !== "DONE") await db.update(gedUploads).set({ url, status: "UPLOADED", error: null }).where(and(eq(gedUploads.id, id), sql`${gedUploads.status}<>'DONE'`));
}
export async function confirmGedUpload(context: AppContext, id: string, url: string, comment: string) {
  const [upload] = await (context.database ?? db).select().from(gedUploads).where(and(eq(gedUploads.id, id), eq(gedUploads.ownerId, context.user.id)));
  if (!upload) throw new Error("Upload não encontrado.");
  authorize(context, upload.checkinDocumentId ? "edit" : "import");
  if (upload.documentId) return { documentId: upload.documentId };
  // GET derives its pathname from the URL and can retain percent encoding
  // (e.g. ':' in a user ID). HEAD returns the canonical storage key, as in resumeGedUpload.
  const { head } = await import("@vercel/blob");
  const stored = await head(url);
  if (stored.pathname !== upload.pathname) throw new Error("Arquivo não pertence ao upload registrado.");
  const bytes = await readGedBytes(url);
  const inspected = await inspectGedBytes(upload.filename, bytes);
  await checkFolder(context, upload.folderId);
  const confirmed = await transact(context, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_UPLOAD:${id}`}))`);
    const [current] = await tx.select().from(gedUploads).where(eq(gedUploads.id, id)).for("update");
    if (current.documentId) return { documentId: current.documentId };
    let documentId: string;
    let versionId: string;
    if (upload.checkinDocumentId) {
      await requireGedObject(context, "document", upload.checkinDocumentId, "edit", tx);
      if (comment.trim().length < 3) throw new Error("Informe o comentário do check-in.");
      await lockDocument(tx, upload.checkinDocumentId);
      const document = await requireManagedDocument(context, upload.checkinDocumentId, tx);
      const [checkout] = await tx.select().from(gedCheckouts).where(and(eq(gedCheckouts.documentId, document.id), isNull(gedCheckouts.closedAt))).for("update");
      if (!checkout || checkout.ownerId !== context.user.id || checkout.versionId !== document.versionId) throw new Error("Reserva de edição inválida ou versão alterada.");
      const [review] = await tx.select().from(gedReviews).where(and(eq(gedReviews.documentId, document.id), eq(gedReviews.status, "ACTIVE")));
      const graphical = await tx.execute(sql`SELECT 1 FROM "GedFlowRun" WHERE "documentId"=${document.id} AND status='ACTIVE'`);
      if (review || graphical.rows.length || document.versionStatus === "PENDING_SIGNATURE") throw new Error("Finalize o fluxo/assinaturas pendentes antes de devolver nova versão.");
      const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: document.versionNumber + 1, fileUrl: url, hashSha256: inspected.hashSha256, publicValidationCode: createPublicValidationCode(), status: "FINAL" }).returning({ id: documentVersions.id });
      await tx.update(documents).set({ fileUrl: url, status: "Válido" }).where(eq(documents.id, document.id));
      await tx.update(gedEntries).set({ filename: upload.filename, mimeType: inspected.mimeType, byteLength: inspected.byteLength, editorialStatus: "RASCUNHO" }).where(eq(gedEntries.documentId, document.id));
      await tx.update(gedCheckouts).set({ closedAt: new Date(), comment: comment.trim() }).where(eq(gedCheckouts.id, checkout.id));
      documentId = document.id; versionId = version.id;
    } else {
      const [documentClass] = await tx.select().from(documentClasses).where(and(eq(documentClasses.code, upload.classCode), eq(documentClasses.isActive, true)));
      if (!documentClass) throw new Error("Selecione uma classe documental ativa.");
      const [definition] = upload.definitionId ? await tx.select().from(gedTypeDefinitions).where(eq(gedTypeDefinitions.id, upload.definitionId)).limit(1) : [];
      const retention = definition?.policy.retentionMonths ?? await retentionMonths(tx);
      const [document] = await tx.insert(documents).values({ title: upload.title, documentType: "Arquivo", fileUrl: url, documentClassId: documentClass.id, folderId: upload.folderId, status: "Válido", retentionMonths: retention }).returning({ id: documents.id });
      const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: url, hashSha256: inspected.hashSha256, publicValidationCode: createPublicValidationCode(), status: "FINAL" }).returning({ id: documentVersions.id });
      await tx.insert(gedEntries).values({ documentId: document.id, ownerId: context.user.id, departmentId: context.user.departmentId, filename: upload.filename, mimeType: inspected.mimeType, byteLength: inspected.byteLength, legacyReference: upload.legacyReference });
      await tx.insert(gedMetadata).values({ documentId: document.id, definitionId: definition?.id ?? null, values: upload.indexValues, responsibleId: context.user.id, alertDays: definition?.policy.alertDays ?? 30, validUntil: definition?.policy.validityDays ? new Date(Date.now() + definition.policy.validityDays * 86400000) : null });
      documentId = document.id; versionId = version.id;
    }
    await tx.insert(gedJobs).values({ versionId }).onConflictDoNothing();
    await tx.insert(gedVersionFiles).values({ versionId, filename: upload.filename, mimeType: inspected.mimeType, byteLength: inspected.byteLength, authorId: context.user.id, comment: comment.trim() });
    await tx.update(gedUploads).set({ url, documentId, status: "DONE", error: null }).where(eq(gedUploads.id, id));
    await audit(tx, context, documentId, upload.checkinDocumentId ? "CHECKIN" : "IMPORT");
    return { documentId };
  });
  const { scheduleGedVercelQueue } = await import("./ged-vercel-dispatch");
  scheduleGedVercelQueue();
  return confirmed;
}

export async function checkoutGed(context: AppContext, id: string, cancel = false) {
  authorize(context, "edit");
  await requireGedObject(context, "document", id, "edit");
  return transact(context, async tx => {
    await lockDocument(tx, id);
    const document = await requireManagedDocument(context, id, tx);
    const [current] = await tx.select().from(gedCheckouts).where(and(eq(gedCheckouts.documentId, id), isNull(gedCheckouts.closedAt)));
    const customFlow = await tx.execute(sql`SELECT 1 FROM "GedFlowRun" WHERE "documentId"=${id} AND status='ACTIVE'`);
    if (customFlow.rows.length && !cancel) throw new Error("Conclua o fluxo gráfico antes de editar.");
    if (cancel) {
      if (!current || current.ownerId !== context.user.id) throw new Error("Somente o responsável pode cancelar a reserva.");
      await tx.update(gedCheckouts).set({ closedAt: new Date(), comment: "Reserva cancelada" }).where(eq(gedCheckouts.id, current.id));
    } else {
      if (current) throw new Error("O documento já está retirado para edição.");
      if (document.versionStatus === "PENDING_SIGNATURE") throw new Error("Documento aguardando assinatura não pode ser retirado.");
      const [review] = await tx.select().from(gedReviews).where(and(eq(gedReviews.documentId, id), eq(gedReviews.status, "ACTIVE")));
      if (review) throw new Error("Conclua ou devolva o fluxo editorial antes de retirar para edição.");
      await tx.insert(gedCheckouts).values({ documentId: id, versionId: document.versionId, ownerId: context.user.id });
    }
    await audit(tx, context, id, cancel ? "CHECKOUT_CANCEL" : "CHECKOUT");
  });
}

export async function createGedFolder(context: AppContext, name: string, parentId: string | null) {
  authorize(context, "import");
  const title = z.string().trim().min(1).max(150).parse(name);
  await checkFolder(context, parentId);
  return transact(context, async tx => {
    const [folder] = await tx.insert(documentFolders).values({ name: title, parentId, departmentId: context.user.departmentId }).returning({ id: documentFolders.id });
    await tx.insert(gedFolderAccess).values({ folderId: folder.id, ownerId: context.user.id, departmentId: context.user.departmentId });
    await audit(tx, context, folder.id, "FOLDER_CREATE");
    return { id: folder.id };
  });
}
export async function moveGedFolder(context: AppContext, id: string, parentId: string | null, name: string) {
  authorize(context, "edit");
  await requireGedObject(context, "folder", id, "edit");
  await checkFolder(context, id); await checkFolder(context, parentId);
  return transact(context, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('GED_FOLDER_TREE'))`);
    if (parentId) {
      const chain = await tx.execute<{ id: string }>(sql`WITH RECURSIVE parents AS (SELECT id,"parentId" FROM "Folder" WHERE id=${parentId} UNION SELECT f.id,f."parentId" FROM "Folder" f JOIN parents p ON f.id=p."parentId") SELECT id FROM parents WHERE id=${id}`);
      if (chain.rows.length) throw new Error("Uma pasta não pode ser movida para si ou para uma descendente.");
    }
    await tx.update(documentFolders).set({ parentId, name: z.string().trim().min(1).max(150).parse(name) }).where(eq(documentFolders.id, id));
    await audit(tx, context, id, "FOLDER_MOVE");
  });
}
export async function listManagedFolders(context: AppContext, parentId: string | null) {
  const result = await (context.database ?? db).execute<{ id: string; name: string; parentId: string | null; children: number; files: number; totalFiles: number }>(sql`
    SELECT f.id,f.name,f."parentId",(SELECT count(*)::int FROM "Folder" child JOIN "GedFolderAccess" ca ON ca."folderId"=child.id WHERE child."parentId"=f.id AND ${gedObjectScope(context, "folder", sql`child.id`, "read")}) AS children,
    (SELECT count(*)::int FROM "Document" d JOIN "GedEntry" e ON e."documentId"=d.id WHERE d."folderId"=f.id AND NOT e.archived AND ${gedEntryScope(context)}) AS files,
    (WITH RECURSIVE branch AS (SELECT f.id UNION ALL SELECT c.id FROM "Folder" c JOIN branch b ON c."parentId"=b.id) SELECT count(*)::int FROM "Document" d JOIN "GedEntry" e ON e."documentId"=d.id WHERE d."folderId" IN (SELECT id FROM branch) AND NOT e.archived AND ${gedEntryScope(context)}) AS "totalFiles"
    FROM "Folder" f JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE ${parentId ? sql`f."parentId"=${parentId}` : sql`f."parentId" IS NULL`}
      AND ${gedObjectScope(context, "folder", sql`f.id`, "read")} ORDER BY f.name,f.id`);
  return result.rows;
}

export async function deleteManagedFolder(context: AppContext, id: string) {
  authorize(context, "edit");
  await requireGedObject(context, "folder", id, "delete");
  return transact(context, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('GED_FOLDER_TREE'))`);
    await checkFolder(context, id, tx);
    const [child] = await tx.select({ id: documentFolders.id }).from(documentFolders).where(eq(documentFolders.parentId, id)).limit(1);
    const [document] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.folderId, id)).limit(1);
    if (child || document) throw new Error("Realocar documentos e subpastas antes de excluir a pasta.");
    await tx.delete(gedFolderAccess).where(eq(gedFolderAccess.folderId, id));
    await tx.delete(documentFolders).where(eq(documentFolders.id, id));
    await audit(tx, context, id, "FOLDER_DELETE");
  });
}

export async function moveManagedDocument(context: AppContext, id: string, folderId: string | null) {
  authorize(context, "edit");
  await requireGedObject(context, "document", id, "edit");
  return transact(context, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('GED_FOLDER_TREE'))`);
    await lockDocument(tx, id);
    const document = await requireManagedDocument(context, id, tx);
    await checkFolder(context, folderId, tx);
    if (document.checkoutOwnerId || document.versionStatus === "PENDING_SIGNATURE") throw new Error("Conclua a reserva/assinatura antes de mover.");
    await tx.update(documents).set({ folderId }).where(eq(documents.id, id));
    await audit(tx, context, id, "DOCUMENT_MOVE");
  });
}

async function notifyStage(tx: DatabaseTransaction, context: AppContext, reviewId: string, documentId: string, stage: number, assignments: GedReviewAssignments) {
  await insertInternalNotifications(tx, { actorUsuarioId: context.user.id, recipientUserIds: assignments[gedStages[stage]], sourceModule: "ASSINATURA_DIGITAL", entityType: "GED_DOCUMENT", entityId: documentId,
    type: "GED_REVIEW", title: `${gedStageLabels[gedStages[stage]]}: tarefa documental`, message: "Acesse GED e Assinatura Digital > Minhas tarefas para revisar a versão vinculada.", dedupeDiscriminator: `${reviewId}:${stage}`, priority: "ALTA" });
}
export async function startGedReview(context: AppContext, documentId: string, raw: unknown, dueAt: string) {
  authorize(context, "edit");
  await requireGedObject(context, "document", documentId, "edit");
  const assignments = z.object({ ELABORACAO: z.array(z.string().min(1)).min(1).max(20), CONSENSO: z.array(z.string().min(1)).min(1).max(20), APROVACAO: z.array(z.string().min(1)).min(1).max(20), HOMOLOGACAO: z.array(z.string().min(1)).min(1).max(20) }).parse(raw);
  const due = z.coerce.date().parse(dueAt);
  if (due.getTime() <= Date.now()) throw new Error("O prazo precisa estar no futuro.");
  const ids = [...new Set(Object.values(assignments).flat())];
  const active = await (context.database ?? db).select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.ativo, true)));
  if (active.length !== ids.length) throw new Error("Todos os responsáveis precisam estar ativos.");
  return transact(context, async tx => {
    await lockDocument(tx, documentId);
    const document = await requireManagedDocument(context, documentId, tx);
    const flow = await tx.execute(sql`SELECT 1 FROM "GedFlowRun" WHERE "documentId"=${documentId} AND status='ACTIVE'`);
    if (flow.rows.length) throw new Error("Já existe fluxo gráfico ativo.");
    if (document.checkoutOwnerId || document.versionStatus !== "FINAL") throw new Error("O fluxo exige versão final sem reserva de edição.");
    const [review] = await tx.insert(gedReviews).values({ documentId, versionId: document.versionId, assignments, dueAt: due, createdById: context.user.id }).returning({ id: gedReviews.id });
    await tx.update(gedEntries).set({ editorialStatus: gedStages[0] }).where(eq(gedEntries.documentId, documentId));
    await notifyStage(tx, context, review.id, documentId, 0, assignments);
    await audit(tx, context, review.id, "REVIEW_START");
    return { id: review.id };
  });
}
export async function decideGedReview(context: AppContext, reviewId: string, decision: "APPROVE" | "RETURN", comment: string) {
  authorize(context, "review");
  const note = z.string().trim().min(3).max(5000).parse(comment);
  return transact(context, async tx => {
    const [snapshot] = await tx.select().from(gedReviews).where(eq(gedReviews.id, reviewId));
    if (!snapshot) throw new Error("Fluxo não encontrado.");
    await requireGedObject(context, "document", snapshot.documentId, "review", tx);
    await lockDocument(tx, snapshot.documentId);
    const [review] = await tx.select().from(gedReviews).where(eq(gedReviews.id, reviewId)).for("update");
    const document = await requireManagedDocument(context, review.documentId, tx);
    const assigned = review.assignments[gedStages[review.stage]];
    if (review.status !== "ACTIVE" || document.versionId !== review.versionId || !assigned.includes(context.user.id)) throw new Error("Tarefa encerrada, versão alterada ou usuário não responsável pela fase.");
    await tx.insert(gedDecisions).values({ reviewId, stage: review.stage, userId: context.user.id, decision, comment: note });
    if (decision === "RETURN") {
      await tx.update(gedReviews).set({ status: "RETURNED" }).where(eq(gedReviews.id, reviewId));
      await tx.update(gedEntries).set({ editorialStatus: "DEVOLVIDO" }).where(eq(gedEntries.documentId, review.documentId));
      await insertInternalNotifications(tx, { actorUsuarioId: context.user.id, recipientUserIds: [review.createdById], sourceModule: "ASSINATURA_DIGITAL", entityType: "GED_DOCUMENT", entityId: review.documentId, type: "GED_RETURNED", title: "Documento devolvido para revisão", message: note.slice(0, 1000), dedupeDiscriminator: `${reviewId}:returned` });
    } else {
      const decisions = await tx.select().from(gedDecisions).where(and(eq(gedDecisions.reviewId, reviewId), eq(gedDecisions.stage, review.stage)));
      if (assigned.every(id => decisions.some(d => d.userId === id && d.decision === "APPROVE"))) {
        if (review.stage === 3) {
          await tx.update(gedReviews).set({ status: "COMPLETED" }).where(eq(gedReviews.id, reviewId));
          await tx.update(gedEntries).set({ editorialStatus: "HOMOLOGADO" }).where(eq(gedEntries.documentId, review.documentId));
        } else {
          await tx.update(gedReviews).set({ stage: review.stage + 1 }).where(eq(gedReviews.id, reviewId));
          await tx.update(gedEntries).set({ editorialStatus: gedStages[review.stage + 1] }).where(eq(gedEntries.documentId, review.documentId));
          await notifyStage(tx, context, reviewId, review.documentId, review.stage + 1, review.assignments);
        }
      }
    }
    await audit(tx, context, reviewId, "REVIEW_DECISION");
  });
}

export async function processGedVersion(context: AppContext, versionId: string) {
  const database = context.database ?? db;
  const [version] = await database.select().from(documentVersions).where(eq(documentVersions.id, versionId));
  if (!version) throw new Error("Versão não encontrada.");
  const document = await requireManagedDocument(context, version.documentId);
  const [versionFile] = await database.select().from(gedVersionFiles).where(eq(gedVersionFiles.versionId, versionId));
  const filename = versionFile?.filename ?? document.filename;
  const mimeType = versionFile?.mimeType ?? document.mimeType;
  if (document.ownerId === context.user.id && canUseGed(context.user, "import")) await requireGedObject(context, "document", document.id, "import");
  else await requireGedObject(context, "document", document.id, "edit");
  const token = randomUUID();
  const lease = await database.execute<{ id: string }>(sql`UPDATE "GedProcessingJob" SET status='RUNNING',attempts=attempts+1,"leaseToken"=${token},"leaseUntil"=now()+interval '10 minutes',error=NULL,"updatedAt"=now() WHERE "versionId"=${versionId} AND (status<>'RUNNING' OR "leaseUntil"<now()) RETURNING id`);
  if (!lease.rows.length) throw new Error("Esta versão já está sendo processada.");
  try {
    const operations = await database.execute<{ value: { semantic?: boolean; pdfaValidation?: boolean } }>(sql`SELECT value FROM "GedSetting" WHERE key='operations'`);
    const step = async (name: string, status: string) => { await database.execute(sql`UPDATE "GedProcessingJob" SET steps=steps||jsonb_build_object(${name}::text,${status}::text),"leaseUntil"=CASE WHEN status='RUNNING' THEN now()+interval '10 minutes' ELSE "leaseUntil" END,"updatedAt"=now() WHERE "versionId"=${versionId} AND "leaseToken"=${token}`); };
    await step("original", "RUNNING");
    const bytes = await readGedBytes(version.fileUrl, version.hashSha256);
    await step("original", "SUCCEEDED");
    await step("extraction", "RUNNING");
    const pages = await extractGedText(filename, bytes);
    await step("extraction", "SUCCEEDED");
    const { embedGedText, searchableGedPdf, saveGedArtifact, imagesToGedPdf, convertGedOffice } = await import("./ged-processing");
    await step("derivatives", "RUNNING");
    if (pages.some(page => page.words?.length)) {
      const pdfBytes = mimeType === "application/pdf" ? bytes : mimeType.startsWith("image/") ? await imagesToGedPdf([bytes]) : await convertGedOffice(filename, bytes);
      await saveGedArtifact(context, document.id, versionId, "searchable", await searchableGedPdf(pdfBytes, "application/pdf", pages));
    } else if (mimeType.startsWith("image/")) {
      await saveGedArtifact(context, document.id, versionId, "converted", await imagesToGedPdf([bytes]));
    } else if (!["application/pdf", "text/plain"].includes(mimeType)) {
      await saveGedArtifact(context, document.id, versionId, "converted", await convertGedOffice(filename, bytes));
    }
    await step("derivatives", "SUCCEEDED");
    if (operations.rows[0]?.value.pdfaValidation && mimeType === "application/pdf") {
      const { validateGedPdfA } = await import("./ged-processing");
      await step("pdfa", "RUNNING"); const report = await validateGedPdfA(bytes);
      await database.execute(sql`INSERT INTO "GedActivity"(id,"documentId","actorId",kind,detail) VALUES(${randomUUID()},${document.id},${context.user.id},'PDFA_VALIDATION',${JSON.stringify(report)}::jsonb)`);
      await step("pdfa", report.compliant ? "COMPLIANT" : "NONCOMPLIANT");
    }
    const embeddings: Array<{ page: number; model: string; vector: number[] }> = [];
    if (operations.rows[0]?.value.semantic) {
      for (const page of pages) { if (!page.text.trim()) continue; await step("semantic", "RUNNING"); embeddings.push({ page: page.page, ...await embedGedText(page.text) }); }
      await step("semantic", "SUCCEEDED");
    }
    await step("index", "RUNNING");
    if (pages.reduce((n, p) => n + p.text.length, 0) > 2_000_000) throw new Error("Texto extraído excede o limite.");
    await transact(context, async tx => {
      const [job] = await tx.select().from(gedJobs).where(and(eq(gedJobs.versionId, versionId), eq(gedJobs.leaseToken, token))).for("update");
      if (!job || !job.leaseUntil || job.leaseUntil.getTime() < Date.now()) throw new Error("A reserva de processamento expirou; repita a operação.");
      for (const page of pages) {
        const [existing] = await tx.select().from(gedPages).where(and(eq(gedPages.versionId, versionId), eq(gedPages.page, page.page)));
        const text = page.text + (existing?.zones.length ? "\n" + existing.zones.map(zone => `${zone.label}: ${zone.text}`).join("\n") : "");
        await tx.insert(gedPages).values({ versionId, page: page.page, text, normalized: normalizeGedText(text), method: page.method }).onConflictDoUpdate({ target: [gedPages.versionId, gedPages.page], set: { text, normalized: normalizeGedText(text), method: page.method } });
        await tx.execute(sql`UPDATE "GedTextPage" SET words=${JSON.stringify(page.words ?? [])}::jsonb WHERE "versionId"=${versionId} AND page=${page.page}`);
      }
      if (operations.rows[0]?.value.semantic) await tx.execute(sql`DELETE FROM "GedEmbedding" WHERE "versionId"=${versionId}`);
      for (const embedding of embeddings) await tx.execute(sql`INSERT INTO "GedEmbedding"("versionId",page,model,vector) VALUES(${versionId},${embedding.page},${embedding.model},${JSON.stringify(embedding.vector)}::jsonb) ON CONFLICT("versionId",page) DO UPDATE SET model=excluded.model,vector=excluded.vector`);
      await tx.execute(sql`UPDATE "GedProcessingJob" SET steps=steps||'{"index":"SUCCEEDED"}'::jsonb WHERE id=${job.id}`);
      await tx.update(gedJobs).set({ status: "SUCCEEDED", leaseUntil: null, leaseToken: null, updatedAt: new Date() }).where(eq(gedJobs.id, job.id));
      await audit(tx, context, versionId, "INDEX");
    });
  } catch (error) {
    await database.update(gedJobs).set({ status: "FAILED", leaseUntil: null, error: error instanceof Error && !/query|constraint|postgres|password|token/i.test(error.message) ? error.message.slice(0, 300) : "Falha no processamento. Repita a operação.", updatedAt: new Date() }).where(and(eq(gedJobs.versionId, versionId), eq(gedJobs.leaseToken, token)));
    await database.execute(sql`UPDATE "GedProcessingJob" SET "nextAttemptAt"=now()+least(attempts*attempts*30,3600)*interval '1 second' WHERE "versionId"=${versionId} AND "leaseToken"=${token}`);
    throw error;
  }
}
export async function recognizeGedZone(context: AppContext, documentId: string, raw: unknown) {
  authorize(context, "edit");
  await requireGedObject(context, "document", documentId, "edit");
  const zone = gedZoneSchema.parse(raw);
  const document = await requireManagedDocument(context, documentId);
  const result = await requestGedOcr(await readGedBytes(document.fileUrl, document.hashSha256), document.mimeType, [zone.page], zone);
  const recognized = result[0];
  return transact(context, async tx => {
    await lockDocument(tx, documentId);
    const current = await requireManagedDocument(context, documentId, tx);
    if (current.versionId !== document.versionId) throw new Error("A versão foi alterada durante o reconhecimento.");
    const [page] = await tx.select().from(gedPages).where(and(eq(gedPages.versionId, document.versionId), eq(gedPages.page, zone.page))).for("update");
    const zones = [...(page?.zones ?? []), { ...zone, text: recognized.text, confidence: recognized.confidence ?? null }];
    const text = `${page?.text ?? ""}\n${zone.label}: ${recognized.text}`;
    await tx.insert(gedPages).values({ versionId: document.versionId, page: zone.page, text, normalized: normalizeGedText(text), method: "OCR_ZONE", zones }).onConflictDoUpdate({ target: [gedPages.versionId, gedPages.page], set: { text, normalized: normalizeGedText(text), zones } });
    await audit(tx, context, document.versionId, "OCR_ZONE");
    return { text: recognized.text, confidence: recognized.confidence ?? null };
  });
}

export async function saveGedSmartFolder(context: AppContext, name: string, query: unknown, shared: boolean) {
  authorize(context, "read");
  if (shared) authorize(context, "configure");
  const [row] = await (context.database ?? db).insert(gedSmartFolders).values({ ownerId: context.user.id, name: z.string().trim().min(1).max(150).parse(name), query: gedQuerySchema.parse(query), shared }).returning({ id: gedSmartFolders.id });
  return row;
}
export async function saveGedTerm(context: AppContext, term: string, equivalents: string[]) {
  authorize(context, "configure");
  const normalized = normalizeGedText(z.string().trim().min(1).max(100).parse(term));
  const values = z.array(z.string().trim().min(1).max(100)).min(1).max(30).parse(equivalents).map(normalizeGedText);
  await (context.database ?? db).insert(gedThesaurus).values({ term: normalized, equivalents: [...new Set(values)] }).onConflictDoUpdate({ target: gedThesaurus.term, set: { equivalents: [...new Set(values)] } });
}

export async function requestGedSignatures(context: AppContext, id: string, signerIds: string[]) {
  authorize(context, "edit");
  await requireGedObject(context, "document", id, "edit");
  return transact(context, async tx => {
    await lockDocument(tx, id);
    const document = await requireManagedDocument(context, id, tx);
    if (document.checkoutOwnerId || document.editorialStatus !== "HOMOLOGADO") throw new Error("Homologue a versão e encerre reservas antes de solicitar assinatura.");
    const { requestDocumentSignaturesForActor } = await import("./document-flow-service");
    const connection = (context as AppContext & { databaseConnection?: DatabaseConnection }).databaseConnection ?? databaseConnection;
    return inDatabaseTransactionScope(connection, tx, () => requestDocumentSignaturesForActor(connection, context.user.id, id, signerIds, { gedDocumentVersionId: document.versionId }));
  });
}

export async function saveGedTemplate(context: AppContext, name: string, content: string, file?: File, templateKey?: string) {
  authorize(context, "models");
  let sourceUrl: string | null = null;
  if (file) {
    if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Importe um arquivo DOCX.");
    const pages = await extractGedText(file.name, Buffer.from(await file.arrayBuffer()));
    content = pages.map(p => p.text).join("\n");
    sourceUrl = (await uploadFile(file)).url;
  }
  const text = z.string().min(1).max(100_000).parse(content);
  return transact(context, async tx => {
    const key = templateKey || randomUUID();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_TEMPLATE:${key}`}))`);
    const [previous] = await tx.select().from(gedTemplates).where(eq(gedTemplates.templateKey, key)).orderBy(desc(gedTemplates.version)).limit(1);
    if (previous && previous.ownerId !== context.user.id) throw new Error("Somente o autor pode criar nova versão do modelo.");
    const [row] = await tx.insert(gedTemplates).values({ templateKey: key, version: (previous?.version ?? 0) + 1, name: z.string().trim().min(1).max(150).parse(name), content: text, sourceUrl, ownerId: context.user.id, departmentId: context.user.departmentId, markers: templateMarkers(text) }).returning({ id: gedTemplates.id });
    await audit(tx, context, row.id, "TEMPLATE");
    return row;
  });
}
export async function generateGedTemplate(context: AppContext, templateId: string, values: Record<string, string>, classCode: string, indexValues: Record<string, unknown> = {}) {
  authorize(context, "import");
  const [template] = await (context.database ?? db).select().from(gedTemplates).where(eq(gedTemplates.id, templateId));
  if (!template || (template.ownerId !== context.user.id && (!template.departmentId || template.departmentId !== context.user.departmentId))) throw new Error("Modelo fora do seu escopo.");
  const text = fillGedTemplate(template.content, values);
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: text.split("\n").map(line => new Paragraph({ children: [new TextRun(line)] })) }] }));
  const id = randomUUID();
  const filename = `${template.name.replace(/[^\p{L}\p{N}._-]/gu, "-")}.docx`;
  const upload = await prepareGedUpload(context, { id, batchId: randomUUID(), filename, title: template.name, classCode, indexValues });
  const { put } = await import("@vercel/blob");
  const blob = await put(upload.pathname, bytes, { access: "private", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", addRandomSuffix: false });
  const created = await confirmGedUpload(context, id, blob.url, "");
  await (context.database ?? db).insert(gedGenerated).values({ documentId: created.documentId, templateVersionId: template.id, values }).onConflictDoNothing();
  return created;
}

export async function readGedDetail(context: AppContext, id: string, requestedVersionPage = 1): Promise<GedDetail> {
  const document = await requireManagedDocument(context, id);
  const database = context.database ?? db;
  const [{ total }] = await database.select({ total: count() }).from(documentVersions).where(eq(documentVersions.documentId, id));
  const versionPage = Math.max(1, Math.min(requestedVersionPage, Math.max(1, Math.ceil(total / 20))));
  const [versions, pages, reviews] = await Promise.all([
    database.select({ version: documentVersions, author: users.nome, comment: gedVersionFiles.comment }).from(documentVersions).leftJoin(gedVersionFiles, eq(gedVersionFiles.versionId, documentVersions.id)).leftJoin(users, eq(users.id, gedVersionFiles.authorId)).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNumber)).limit(20).offset((versionPage - 1) * 20),
    database.select().from(gedPages).where(eq(gedPages.versionId, document.versionId)).orderBy(gedPages.page).limit(200),
    database.select().from(gedReviews).where(eq(gedReviews.documentId, id)).orderBy(desc(gedReviews.createdAt)).limit(1),
  ]);
  const review = reviews[0];
  const decisions = review ? await database.select().from(gedDecisions).where(eq(gedDecisions.reviewId, review.id)).orderBy(gedDecisions.createdAt) : [];
  const central = await database.select({ code: centralRecords.code, signedAt: centralRecords.signedAt, method: sql<string>`${centralRecords.evidence}->'envelope'->>'method'` }).from(gedCentralSignatures).innerJoin(centralRecords, eq(centralRecords.id, gedCentralSignatures.recordId)).where(eq(gedCentralSignatures.versionId, document.versionId));
  // Do not return private Blob URLs to the client.
  const dto = { id: document.id, title: document.title, documentType: document.documentType, status: document.status, editorialStatus: document.editorialStatus,
    filename: document.filename, mimeType: document.mimeType, byteLength: document.byteLength, origin: document.origin, legacyReference: document.legacyReference,
    folderId: document.folderId, folderName: document.folderName, versionId: document.versionId, versionNumber: document.versionNumber, hashSha256: document.hashSha256,
    versionStatus: document.versionStatus, checkoutOwnerId: document.checkoutOwnerId, createdAt: document.createdAt, page: document.page, snippet: document.snippet };
  return { document: dto, versionPage, versionTotal: total, centralSignatures: central.map(s => ({ code: s.code, method: s.method, signedAt: s.signedAt?.toISOString() ?? "" })), versions: versions.map(({ version: v, author, comment }) => ({ id: v.id, number: v.versionNumber, status: v.status, hash: v.hashSha256, createdAt: v.createdAt.toISOString(), code: v.publicValidationCode, author: author ?? "Origem integrada", comment: comment ?? "" })),
    pages: pages.map(p => ({ page: p.page, text: p.text, method: p.method, zones: p.zones })),
    review: review ? { id: review.id, stage: review.stage, status: review.status, dueAt: review.dueAt.toISOString(), assignments: review.assignments } : null,
    decisions: decisions.map(d => ({ stage: d.stage, userId: d.userId, decision: d.decision, comment: d.comment, createdAt: d.createdAt.toISOString() })) };
}
