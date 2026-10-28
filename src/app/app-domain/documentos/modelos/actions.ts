"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { documents } from "@/db/schema/registry";

async function authorize(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("DOCUMENTOS", operation);
}

export async function updateModelo(
  id: string,
  data: { title?: string; notes?: string | null; status?: string }
) {
  await authorize("update");
  const [updated] = await db.update(documents).set(data).where(eq(documents.id, id)).returning({ id: documents.id });
  if (!updated) throw new Error("Documento não encontrado.");
  revalidatePath("/documentos/modelos");
  revalidatePath("/documentos");
}

export async function deleteModelo(id: string) {
  await authorize("delete");
  const [deleted] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (!deleted) throw new Error("Documento não encontrado.");
  revalidatePath("/documentos/modelos");
  revalidatePath("/documentos");
}

export async function createModelo(title: string, notes: string) {
  await authorize("create");
  if (!title.trim()) throw new Error("Título obrigatório");
  await db.insert(documents).values({
      title: title.trim(),
      documentType: "Modelo",
      fileUrl: `/modelos/${Date.now()}_${title.trim().replace(/\s+/g, "_")}.docx`,
      status: "Ativo",
      notes: notes?.trim() || null,
  });
  revalidatePath("/documentos/modelos");
  revalidatePath("/documentos");
}
