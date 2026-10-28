import { and, count, desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../../connection";
import { createId } from "../../ids";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "../../transaction";
import { cemeteryAttachments, cemeteryGraves, cemeteryLots, cemeteryProcesses } from "../../schema/cemeteries";
import { documents } from "../../schema/registry";
import { insertAuditEvent } from "../platform/audit";
import { AccessError } from "@/lib/platform/access-error";
import type { CemeteryAttachmentTarget } from "@/lib/cemeteries/attachments";

export async function requireCemeteryAttachmentTarget(db: DatabaseExecutor, target: CemeteryAttachmentTarget): Promise<void> {
  const found = target.targetType === "LOTE"
    ? await db.select({ id: cemeteryLots.id }).from(cemeteryLots).where(eq(cemeteryLots.id, target.targetId)).limit(1)
    : target.targetType === "SEPULTURA"
      ? await db.select({ id: cemeteryGraves.id }).from(cemeteryGraves).where(eq(cemeteryGraves.id, target.targetId)).limit(1)
      : await db.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.id, target.targetId), eq(cemeteryProcesses.processType, target.targetType))).limit(1);
  if (!found[0]) throw new AccessError("Destino do anexo não encontrado.", 404);
}

export async function insertCemeteryAttachmentInTransaction(tx: DatabaseTransaction, actorId: string, target: CemeteryAttachmentTarget, input: { requestKey: string; title: string; fileUrl: string; hashSha256: string }): Promise<{ id: string; created: boolean }> {
  await requireCemeteryAttachmentTarget(tx, target);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cemetery-upload:${input.requestKey}`}))`);
  const [repeated] = await tx.select().from(cemeteryAttachments).where(eq(cemeteryAttachments.documentId, input.requestKey)).limit(1);
  if (repeated) {
    const versions = await tx.execute<{ hashSha256: string }>(sql`SELECT "hashSha256" FROM "DocumentVersion" WHERE "documentId"=${input.requestKey} LIMIT 1`);
    if (repeated.createdByUsuarioId !== actorId || repeated.targetId !== target.targetId || repeated.targetType !== target.targetType || versions.rows[0]?.hashSha256 !== input.hashSha256) throw new AccessError("Chave de upload indisponível.", 403);
    return { id: repeated.id, created: false };
  }
  await tx.insert(documents).values({ id: input.requestKey, title: input.title, documentType: "CEMITERIO", fileUrl: input.fileUrl, status: "Válido", notes: "Upload próprio do módulo Cemitérios" });
  await tx.execute(sql`INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256",status,"lockedAt") VALUES (${createId()},${input.requestKey},1,${input.fileUrl},${input.hashSha256},'FINAL',${new Date()})`);
  const [attachment] = await tx.insert(cemeteryAttachments).values({ ...target, documentId: input.requestKey, createdByUsuarioId: actorId }).returning({ id: cemeteryAttachments.id });
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: "GED_DOCUMENT_INGESTED", targetType: "CEMETERY_ATTACHMENT", targetId: attachment.id });
  return { id: attachment.id, created: true };
}

export async function insertCemeteryAttachment(connection: DatabaseConnection, actorId: string, target: CemeteryAttachmentTarget, input: { requestKey: string; title: string; fileUrl: string; hashSha256: string }): Promise<{ id: string; created: boolean }> {
  return withDatabaseTransaction(connection, tx => insertCemeteryAttachmentInTransaction(tx, actorId, target, input));
}

export async function readCemeteryAttachments(db: DatabaseExecutor, target: CemeteryAttachmentTarget, requestedPage: number): Promise<{ total: number; page: number; items: { id: string; title: string; createdAt: string; authorId: string }[] }> {
  await requireCemeteryAttachmentTarget(db, target);
  const where = and(eq(cemeteryAttachments.targetType, target.targetType), eq(cemeteryAttachments.targetId, target.targetId));
  const [totals] = await db.select({ total: count() }).from(cemeteryAttachments).where(where);
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(totals.total / 20)));
  const rows = await db.select({ id: cemeteryAttachments.id, title: documents.title, createdAt: cemeteryAttachments.createdAt, authorId: cemeteryAttachments.createdByUsuarioId }).from(cemeteryAttachments).innerJoin(documents, eq(documents.id, cemeteryAttachments.documentId)).where(where).orderBy(desc(cemeteryAttachments.createdAt), desc(cemeteryAttachments.id)).offset((page - 1) * 20).limit(20);
  return { total: totals.total, page, items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) };
}

export async function readCemeteryAttachmentDownload(db: DatabaseExecutor, id: string): Promise<{ id: string; targetType: string; targetId: string; documentId: string; documentType: string; notes: string | null; fileUrl: string; status: string; shared: boolean; hashSha256: string | null } | null> {
  const rows = await db.execute<{ id: string; targetType: string; targetId: string; documentId: string; documentType: string; notes: string | null; fileUrl: string; status: string; shared: boolean; hashSha256: string | null }>(sql`
    SELECT a.id,a."targetType",a."targetId",d.id AS "documentId",d."documentType",d.notes,d."fileUrl",d.status,
      (EXISTS(SELECT 1 FROM "ProcessDocument" x WHERE x."documentId"=d.id)
       OR EXISTS(SELECT 1 FROM "TicketDocument" x WHERE x."documentId"=d.id)
       OR EXISTS(SELECT 1 FROM "OmbudsmanDocument" x WHERE x."documentId"=d.id)
       OR EXISTS(SELECT 1 FROM "HealthClinicalDocument" x WHERE x."documentId"=d.id)
       OR EXISTS(SELECT 1 FROM "HealthStandardDocument" x WHERE x."documentId"=d.id)
       OR EXISTS(SELECT 1 FROM "SstCertificateDocument" x WHERE x."documentId"=d.id)) AS shared,
      (SELECT v."hashSha256" FROM "DocumentVersion" v WHERE v."documentId"=d.id AND v."fileUrl"=d."fileUrl" AND v.status IN ('FINAL','SIGNED') LIMIT 1) AS "hashSha256"
    FROM "CemeteryAttachment" a JOIN "Document" d ON d.id=a."documentId" WHERE a.id=${id}`);
  return rows.rows[0] ?? null;
}
