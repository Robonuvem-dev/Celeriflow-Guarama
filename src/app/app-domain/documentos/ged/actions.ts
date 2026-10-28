"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { ingestGedDocument, requestInternalDocumentSignatures } from "@/lib/documents/document-flow-service";
import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { eq } from "drizzle-orm";
import { documents } from "@/db/schema/registry";
import { documentFolders } from "@/db/schema/document-workflow";

async function authorize(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("DOCUMENTOS", operation);
}

export async function createFolder(name: string, parentId: string | null) {
  await authorize("create");
  if (!name.trim()) throw new Error("Nome obrigatório");
  await db.insert(documentFolders).values({ name: name.trim(), parentId: parentId || null });
  revalidatePath("/documentos/ged");
  revalidatePath("/documentos");
}

export async function createDocument(
  title: string,
  documentType: string,
  documentClassCode: string,
  publicLabel: string,
  fileUrl: string,
  folderId: string | null
) {
  const context = await getTenantContextForModuleOperation("DOCUMENTOS", "create");
  if (!title.trim()) throw new Error("Título obrigatório");
  await ingestGedDocument(databaseConnection, {
    title,
    documentType: documentType || "Arquivo",
    documentClassCode,
    publicLabel,
    fileUrl,
    folderId: folderId || null,
    actorUsuarioId: context.user.id,
  });
  revalidatePath("/documentos/ged");
  revalidatePath("/documentos");
}

export async function requestInternalSignatures(documentId: string, signerUsuarioIds: string[]): Promise<{ error: string | null; qrValidationUrl?: string }> {
  try {
    const context = await getTenantContextForModuleOperation("DOCUMENTOS", "create");
    const result = await requestInternalDocumentSignatures(context, documentId, signerUsuarioIds);
    revalidatePath("/documentos");
    revalidatePath("/documentos/assinaturas");
    revalidatePath("/documentos/ged");
    return { error: null, qrValidationUrl: result.qrValidationUrl };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nao foi possivel solicitar as assinaturas." };
  }
}

export async function deleteDocument(id: string) {
  await authorize("delete");
  const [deleted] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (!deleted) throw new Error("Documento não encontrado.");
  revalidatePath("/documentos/ged");
  revalidatePath("/documentos");
}

export async function deleteFolder(id: string) {
  await authorize("delete");
  // First move all documents inside to folderId = null (unlink), then delete
  await db.update(documents).set({ folderId: null }).where(eq(documents.folderId, id));
  // Recursively unlink sub-folders' documents
  const subFolders = await db.select({ id: documentFolders.id }).from(documentFolders).where(eq(documentFolders.parentId, id));
  for (const sub of subFolders) {
    await db.update(documents).set({ folderId: null }).where(eq(documents.folderId, sub.id));
    const [deleted] = await db.delete(documentFolders).where(eq(documentFolders.id, sub.id)).returning({ id: documentFolders.id });
    if (!deleted) throw new Error("Pasta não encontrada.");
  }
  const [deleted] = await db.delete(documentFolders).where(eq(documentFolders.id, id)).returning({ id: documentFolders.id });
  if (!deleted) throw new Error("Pasta não encontrada.");
  revalidatePath("/documentos/ged");
  revalidatePath("/documentos");
}
