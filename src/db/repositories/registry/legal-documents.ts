import { and, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { DatabaseTransaction, DatabaseExecutor } from "@/db/transaction";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { legalTextDatabaseDocumentBlobs, legalTextDatabaseDocuments, legalTextDocuments } from "@/db/schema/legal-documents";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { gedEntryScope } from "@/lib/documents/ged-access";
import { gedHash, inspectGedBytes } from "@/lib/documents/ged-storage";
import type { AppContext } from "@/lib/platform/tenant-context";
import { LegalDocumentError, type legalDatabaseDocumentInput, type legalDocumentInput } from "@/lib/cadastros/legal-document-policy";

export async function requireLegalDocumentSchema(db: DatabaseExecutor) {
  const r = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('public."LegalTextDocument"') IS NOT NULL AS ready`);
  if (!r.rows[0]?.ready) throw new LegalDocumentError("O vínculo documental jurídico ainda não está disponível nesta instância.", 503);
}
export async function hasLegalDatabaseDocumentSchema(db: DatabaseExecutor) {
  const r = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('public."LegalTextDatabaseDocument"') IS NOT NULL AND to_regclass('public."LegalTextDatabaseDocumentBlob"') IS NOT NULL AS ready`);
  return Boolean(r.rows[0]?.ready);
}
export async function requireLegalDatabaseDocumentSchema(db: DatabaseExecutor) {
  if (!await hasLegalDatabaseDocumentSchema(db)) throw new LegalDocumentError("O armazenamento direto de arquivos no banco ainda não está disponível nesta instância.", 503);
}
export async function bindLegalDocument(tx: DatabaseTransaction, context: AppContext, input: z.infer<typeof legalDocumentInput>) {
  await requireLegalDocumentSchema(tx);
  const [legal] = await tx.select().from(legalTexts).where(eq(legalTexts.id, input.legalTextId)).limit(1).for("update");
  if (!legal) throw new LegalDocumentError("Texto jurídico não encontrado.", 404);
  const [version] = await tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, legal.id)).orderBy(desc(legalTextVersions.versionNumber)).limit(1);
  if (!version || version.id !== input.legalTextVersionId || version.versionNumber !== input.expectedVersion) throw new LegalDocumentError("A norma foi alterada. Atualize a lista antes de vincular o arquivo.", 409);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${input.documentId}`}))`);
  const document = await requireManagedDocument(context, input.documentId, tx);
  if (document.versionId !== input.documentVersionId || !["FINAL", "SIGNED"].includes(document.versionStatus) || document.checkoutOwnerId) throw new LegalDocumentError("Confira a versão final do documento e encerre a reserva de edição antes de vinculá-lo.", 409);
  const [same] = await tx.select().from(legalTextDocuments).where(and(eq(legalTextDocuments.legalTextVersionId, version.id), eq(legalTextDocuments.documentVersionId, document.versionId))).limit(1);
  if (same) { if (same.role !== input.role) throw new LegalDocumentError("O arquivo já está vinculado com outra finalidade.", 409); return same.id; }
  if (input.role === "ORIGINAL") {
    if (version.documentId && version.documentId !== document.id) throw new LegalDocumentError("A versão jurídica já tem original. Registre uma nova versão para substituí-lo.", 409);
    const [original] = await tx.select().from(legalTextDocuments).where(and(eq(legalTextDocuments.legalTextVersionId, version.id), eq(legalTextDocuments.role, "ORIGINAL"))).limit(1);
    if (original) throw new LegalDocumentError("A versão jurídica já tem original.", 409);
    if (await hasLegalDatabaseDocumentSchema(tx)) {
      const [dbOriginal] = await tx.select({ id: legalTextDatabaseDocuments.id }).from(legalTextDatabaseDocuments).where(and(eq(legalTextDatabaseDocuments.legalTextVersionId, version.id), eq(legalTextDatabaseDocuments.role, "ORIGINAL"))).limit(1);
      if (dbOriginal) throw new LegalDocumentError("A versão jurídica já tem original gravado no banco.", 409);
    }
    const [used] = await tx.select({ id: legalTextVersions.id }).from(legalTextVersions).where(eq(legalTextVersions.documentId, document.id)).limit(1);
    if (used && used.id !== version.id) throw new LegalDocumentError("Este documento já é original de outra versão jurídica. O vínculo legado é exclusivo; utilize-o como anexo ou selecione outro original.", 409);
    await tx.update(legalTextVersions).set({ documentId: document.id }).where(eq(legalTextVersions.id, version.id));
  }
  const [link] = await tx.insert(legalTextDocuments).values({ legalTextVersionId: version.id, documentVersionId: document.versionId, role: input.role, label: document.filename.slice(0, 250), createdById: context.user.id }).returning({ id: legalTextDocuments.id });
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "LEGAL_TEXT_DOCUMENT", targetId: link.id });
  return link.id;
}
export async function saveLegalDatabaseDocument(tx: DatabaseTransaction, context: AppContext, input: z.infer<typeof legalDatabaseDocumentInput>) {
  await requireLegalDatabaseDocumentSchema(tx);
  const [legal] = await tx.select().from(legalTexts).where(eq(legalTexts.id, input.legalTextId)).limit(1).for("update");
  if (!legal) throw new LegalDocumentError("Texto jurídico não encontrado.", 404);
  const [version] = await tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, legal.id)).orderBy(desc(legalTextVersions.versionNumber)).limit(1);
  if (!version || version.id !== input.legalTextVersionId || version.versionNumber !== input.expectedVersion) throw new LegalDocumentError("A norma foi alterada. Atualize a lista antes de gravar o arquivo.", 409);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(input.contentBase64)) throw new LegalDocumentError("Conteúdo binário inválido.", 400);
  const bytes = Buffer.from(input.contentBase64, "base64");
  let inspected: Awaited<ReturnType<typeof inspectGedBytes>>;
  try {
    inspected = await inspectGedBytes(input.filename, bytes);
  } catch (error) {
    throw new LegalDocumentError(error instanceof Error ? error.message : "Arquivo Word/LibreOffice inválido.", 400);
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`LEGAL_DB_DOC:${version.id}:${inspected.hashSha256}`}))`);
  const [same] = await tx.select().from(legalTextDatabaseDocuments).where(and(eq(legalTextDatabaseDocuments.legalTextVersionId, version.id), eq(legalTextDatabaseDocuments.hashSha256, inspected.hashSha256))).limit(1);
  if (same) {
    if (same.role !== input.role) throw new LegalDocumentError("O arquivo já está gravado nesta versão com outra finalidade.", 409);
    return same.id;
  }
  if (input.role === "ORIGINAL") {
    if (version.documentId) throw new LegalDocumentError("A versão jurídica já tem original. Registre uma nova versão para substituí-lo.", 409);
    const [existingDbOriginal] = await tx.select({ id: legalTextDatabaseDocuments.id }).from(legalTextDatabaseDocuments).where(and(eq(legalTextDatabaseDocuments.legalTextVersionId, version.id), eq(legalTextDatabaseDocuments.role, "ORIGINAL"))).limit(1);
    if (existingDbOriginal) throw new LegalDocumentError("A versão jurídica já tem original.", 409);
    const hasGedTable = await tx.execute<{ ready: boolean }>(sql`SELECT to_regclass('public."LegalTextDocument"') IS NOT NULL AS ready`);
    if (hasGedTable.rows[0]?.ready) {
      const [existingGedOriginal] = await tx.select({ id: legalTextDocuments.id }).from(legalTextDocuments).where(and(eq(legalTextDocuments.legalTextVersionId, version.id), eq(legalTextDocuments.role, "ORIGINAL"))).limit(1);
      if (existingGedOriginal) throw new LegalDocumentError("A versão jurídica já tem original.", 409);
    }
  }
  const [saved] = await tx.insert(legalTextDatabaseDocuments).values({
    legalTextVersionId: version.id,
    role: input.role,
    filename: input.filename.slice(0, 250),
    mimeType: inspected.mimeType,
    byteLength: inspected.byteLength,
    hashSha256: inspected.hashSha256,
    createdById: context.user.id,
  }).returning({ id: legalTextDatabaseDocuments.id });
  await tx.insert(legalTextDatabaseDocumentBlobs).values({
    documentId: saved.id,
    contentBase64: bytes.toString("base64"),
  });
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "LEGAL_TEXT_DATABASE_DOCUMENT", targetId: saved.id });
  return saved.id;
}
export async function readLegalDatabaseDocument(db: DatabaseExecutor, legalTextVersionId: string, id: string) {
  if (!await hasLegalDatabaseDocumentSchema(db)) return null;
  const [row] = await db.select({
    id: legalTextDatabaseDocuments.id,
    filename: legalTextDatabaseDocuments.filename,
    mimeType: legalTextDatabaseDocuments.mimeType,
    byteLength: legalTextDatabaseDocuments.byteLength,
    hashSha256: legalTextDatabaseDocuments.hashSha256,
    contentBase64: legalTextDatabaseDocumentBlobs.contentBase64,
  }).from(legalTextDatabaseDocuments)
    .innerJoin(legalTextDatabaseDocumentBlobs, eq(legalTextDatabaseDocumentBlobs.documentId, legalTextDatabaseDocuments.id))
    .where(and(eq(legalTextDatabaseDocuments.id, id), eq(legalTextDatabaseDocuments.legalTextVersionId, legalTextVersionId)))
    .limit(1);
  if (!row) return null;
  const bytes = Buffer.from(row.contentBase64, "base64");
  if (bytes.length !== row.byteLength || gedHash(bytes) !== row.hashSha256) {
    throw new LegalDocumentError("A integridade do arquivo gravado no banco diverge do registro.", 409);
  }
  return { id: row.id, filename: row.filename, mimeType: row.mimeType, byteLength: row.byteLength, hashSha256: row.hashSha256, bytes };
}
export async function listLegalDocuments(db: DatabaseExecutor, context: AppContext, legalTextVersionId: string, requestedPage = 1) {
  await requireLegalDocumentSchema(db);
  if (!await hasLegalDatabaseDocumentSchema(db)) {
    const from = sql`FROM "LegalTextDocument" l JOIN "DocumentVersion" v ON v.id=l."documentVersionId" JOIN "Document" d ON d.id=v."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE l."legalTextVersionId"=${legalTextVersionId} AND NOT e.archived AND ${gedEntryScope(context)}`;
    const count = await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${from}`);
    const total = count.rows[0]?.total ?? 0, page = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))));
    const rows = await db.execute<{ id: string; role: string; filename: string; documentId: string; documentVersionId: string; versionNumber: number; hash: string; storage?: "GED" | "DATABASE" }>(sql`SELECT l.id,l.role,l.label AS filename,d.id AS "documentId",v.id AS "documentVersionId",v."versionNumber",v."hashSha256" AS hash, 'GED'::text AS storage ${from} ORDER BY l."createdAt",l.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
    return { rows: rows.rows, page, total };
  }
  const combined = sql`(
    SELECT l.id, l.role, l.label AS filename, d.id AS "documentId", v.id AS "documentVersionId", v."versionNumber" AS "versionNumber", v."hashSha256" AS hash, 'GED'::text AS storage, l."createdAt" AS "createdAt"
    FROM "LegalTextDocument" l
    JOIN "DocumentVersion" v ON v.id=l."documentVersionId"
    JOIN "Document" d ON d.id=v."documentId"
    JOIN "GedEntry" e ON e."documentId"=d.id
    WHERE l."legalTextVersionId"=${legalTextVersionId} AND NOT e.archived AND ${gedEntryScope(context)}
    UNION ALL
    SELECT b.id, b.role, b.filename, b.id AS "documentId", b.id AS "documentVersionId", 1 AS "versionNumber", b."hashSha256" AS hash, 'DATABASE'::text AS storage, b."createdAt" AS "createdAt"
    FROM "LegalTextDatabaseDocument" b
    WHERE b."legalTextVersionId"=${legalTextVersionId}
  ) AS u`;
  const count = await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${combined}`);
  const total = count.rows[0]?.total ?? 0, page = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))));
  const rows = await db.execute<{ id: string; role: string; filename: string; documentId: string; documentVersionId: string; versionNumber: number; hash: string; storage?: "GED" | "DATABASE" }>(sql`SELECT u.id,u.role,u.filename,u."documentId",u."documentVersionId",u."versionNumber",u.hash,u.storage FROM ${combined} ORDER BY u."createdAt",u.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { rows: rows.rows, page, total };
}
