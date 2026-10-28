import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { type DatabaseTransaction, withDatabaseTransaction } from "@/db/transaction";
import { documentFolders } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { uploadGeneratedFinancialFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";

const financialFolderName = "Financeiro";

async function resolveFinancialFolder(tx: DatabaseTransaction) {
  // Serializing this lookup prevents simultaneous reports from creating duplicate root folders.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED:${financialFolderName}`}))::text`);
  const [folder] = await tx.select({ id: documentFolders.id }).from(documentFolders).where(and(eq(documentFolders.name, financialFolderName), isNull(documentFolders.parentId))).limit(1);
  if (folder) return folder.id;
  const [created] = await tx.insert(documentFolders).values({ name: financialFolderName, description: "Documentos gerados pelo módulo Financeiro." }).returning({ id: documentFolders.id });
  return created.id;
}

async function moveFinancialDocumentsToFolder(tx: DatabaseTransaction, folderId: string) {
  await tx.update(documents).set({ folderId }).where(and(isNull(documents.folderId), or(sql`starts_with(${documents.documentType}, 'FINANCEIRO:')`, sql`starts_with(${documents.documentType}, 'PUBLIC_FINANCIAL_REPORT:')`)));
}

export async function ensureFinancialGedFolder(db: DatabaseConnection) {
  return withDatabaseTransaction(db, async (tx) => {
    const folderId = await resolveFinancialFolder(tx);
    await moveFinancialDocumentsToFolder(tx, folderId);
    return folderId;
  });
}

export async function saveFinancialFileToGed(
  db: DatabaseConnection,
  input: {
    title: string;
    documentType: string;
    filename: string;
    content: string | Uint8Array;
    contentType: string;
    fileUrl?: string;
    actorUsuarioId: string;
  },
) {
  const file = input.fileUrl
    ? { url: input.fileUrl }
    : await uploadGeneratedFinancialFile(input.filename, input.content, input.contentType);
  const folderId = await withDatabaseTransaction(db, async (tx) => {
    const folderId = await resolveFinancialFolder(tx);
    await moveFinancialDocumentsToFolder(tx, folderId);
    return folderId;
  });
  const document = await ingestGedDocument(db, {
    title: input.title,
    documentType: input.documentType,
    documentClassCode: "GED_EXTERNAL_PROVIDER_REQUIRED",
    fileUrl: file.url,
    folderId,
    content: input.content,
    actorUsuarioId: input.actorUsuarioId,
  });
  return { documentId: document.documentId, folderId };
}
