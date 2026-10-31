import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { documents } from "../../schema/registry";
import { documentClasses, documentFolders, documentSignatures, documentVersions } from "../../schema/document-workflow";
import { users } from "../../schema/identity";
import type { DocumentRecord } from "@/lib/contracts/registry";
import type { DocumentFolder, DocumentFolderWithCounts } from "@/lib/contracts/documents";

export async function getDocumentDashboard(db: DatabaseExecutor): Promise<{ totalDocuments: number; totalFolders: number; pendentesAssinatura: number }> {
  const [[total], [folders], [pending]] = await Promise.all([
    db.select({ value: count() }).from(documents).where(ne(documents.documentType, "Modelo")),
    db.select({ value: count() }).from(documentFolders),
    db.select({ value: count() }).from(documents).where(eq(documents.status, "Pendente Assinatura")),
  ]);
  return { totalDocuments: total.value, totalFolders: folders.value, pendentesAssinatura: pending.value };
}
export async function listDocumentModels(db: DatabaseExecutor): Promise<DocumentRecord[]> {
  return db.select().from(documents).where(and(eq(documents.documentType, "Modelo"), sql`NOT EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=${documents.id})`)).orderBy(desc(documents.updatedAt));
}
export async function listGedDocuments(db: DatabaseExecutor, folderId: string | null, recent: boolean): Promise<DocumentRecord[]> {
  return db.select().from(documents).where(and(folderId ? eq(documents.folderId, folderId) : and(ne(documents.documentType, "Modelo"), recent ? undefined : isNull(documents.folderId)), sql`NOT EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=${documents.id})`)).orderBy(desc(documents.createdAt));
}
export async function readGedFolder(db: DatabaseExecutor, id: string): Promise<(DocumentFolder & { parent: DocumentFolder | null }) | null> {
  const parent = alias(documentFolders, "parent");
  const [row] = await db.select({ folder: documentFolders, parent }).from(documentFolders).leftJoin(parent, eq(parent.id, documentFolders.parentId)).where(and(eq(documentFolders.id, id), sql`NOT EXISTS(SELECT 1 FROM "GedFolderAccess" a WHERE a."folderId"=${documentFolders.id})`)).limit(1);
  return row ? { ...row.folder, parent: row.parent } : null;
}
export async function listGedFolders(db: DatabaseExecutor, parentId: string | null): Promise<DocumentFolderWithCounts[]> {
  const rows = await db.select({ folder: documentFolders, documentCount: sql<number>`(SELECT count(*)::int FROM "Document" d WHERE d."folderId"="Folder"."id" AND NOT EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=d.id))`, childrenCount: sql<number>`(SELECT count(*)::int FROM "Folder" f WHERE f."parentId"="Folder"."id" AND NOT EXISTS(SELECT 1 FROM "GedFolderAccess" a WHERE a."folderId"=f.id))` }).from(documentFolders).where(and(parentId ? eq(documentFolders.parentId, parentId) : isNull(documentFolders.parentId), sql`NOT EXISTS(SELECT 1 FROM "GedFolderAccess" a WHERE a."folderId"=${documentFolders.id})`)).orderBy(asc(documentFolders.name));
  return rows.map(row => ({ ...row.folder, _count: { documents: row.documentCount, children: row.childrenCount } }));
}
export async function listGedSelectors(db: DatabaseExecutor): Promise<{ documentClasses: { code: string; label: string; signaturePolicy: string }[]; signers: { id: string; nome: string; email: string }[] }> {
  const [classes, signers] = await Promise.all([
    db.select({ code: documentClasses.code, label: documentClasses.label, signaturePolicy: documentClasses.signaturePolicy }).from(documentClasses).where(eq(documentClasses.isActive, true)).orderBy(asc(documentClasses.label)),
    db.select({ id: users.id, nome: users.nome, email: users.email }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.nome)),
  ]);
  return { documentClasses: classes, signers };
}
export async function listPendingDocumentSignatures(db: DatabaseExecutor, userId: string): Promise<{ documentId: string; requestedAt: Date; document: { title: string; documentType: string; status: string } }[]> {
  return db.select({ documentId: documentSignatures.documentId, requestedAt: documentSignatures.requestedAt, document: { title: documents.title, documentType: documents.documentType, status: documents.status } }).from(documentSignatures).innerJoin(documents, eq(documents.id, documentSignatures.documentId)).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).where(and(eq(documentSignatures.signerUsuarioId, userId), eq(documentSignatures.status, "PENDING"), eq(documentVersions.status, "PENDING_SIGNATURE"))).orderBy(asc(documentSignatures.requestedAt));
}
