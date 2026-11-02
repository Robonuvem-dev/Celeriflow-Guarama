import { and, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { DatabaseTransaction, DatabaseExecutor } from "@/db/transaction";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { legalTextDocuments } from "@/db/schema/legal-documents";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { gedEntryScope } from "@/lib/documents/ged-access";
import type { AppContext } from "@/lib/platform/tenant-context";
import { LegalDocumentError, type legalDocumentInput } from "@/lib/cadastros/legal-document-policy";

export async function requireLegalDocumentSchema(db: DatabaseExecutor) {
  const r = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('public."LegalTextDocument"') IS NOT NULL AS ready`);
  if (!r.rows[0]?.ready) throw new LegalDocumentError("O vínculo documental jurídico ainda não está disponível nesta instância.", 503);
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
    const [used] = await tx.select({ id: legalTextVersions.id }).from(legalTextVersions).where(eq(legalTextVersions.documentId, document.id)).limit(1);
    if (used && used.id !== version.id) throw new LegalDocumentError("Este documento já é original de outra versão jurídica. O vínculo legado é exclusivo; utilize-o como anexo ou selecione outro original.", 409);
    await tx.update(legalTextVersions).set({ documentId: document.id }).where(eq(legalTextVersions.id, version.id));
  }
  const [link] = await tx.insert(legalTextDocuments).values({ legalTextVersionId: version.id, documentVersionId: document.versionId, role: input.role, label: document.filename.slice(0, 250), createdById: context.user.id }).returning({ id: legalTextDocuments.id });
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "LEGAL_TEXT_DOCUMENT", targetId: link.id });
  return link.id;
}
export async function listLegalDocuments(db: DatabaseExecutor, context: AppContext, legalTextVersionId: string, requestedPage = 1) {
  await requireLegalDocumentSchema(db);
  const from = sql`FROM "LegalTextDocument" l JOIN "DocumentVersion" v ON v.id=l."documentVersionId" JOIN "Document" d ON d.id=v."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE l."legalTextVersionId"=${legalTextVersionId} AND NOT e.archived AND ${gedEntryScope(context)}`;
  const count = await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${from}`);
  const total = count.rows[0]?.total ?? 0, page = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))));
  const rows = await db.execute<{ id: string; role: string; filename: string; documentId: string; documentVersionId: string; versionNumber: number; hash: string }>(sql`SELECT l.id,l.role,l.label AS filename,d.id AS "documentId",v.id AS "documentVersionId",v."versionNumber",v."hashSha256" AS hash ${from} ORDER BY l."createdAt",l.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { rows: rows.rows, page, total };
}
