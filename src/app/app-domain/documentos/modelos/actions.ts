"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { documents } from "@/db/schema/registry";

async function authorize(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("DOCUMENTOS", operation);
}

export async function updateModelo(
  id: string,
  data: { title?: string; notes?: string | null; status?: string }
) {
  await authorize("update");
  const fields = z.object({ title: z.string().trim().min(1).max(500).optional(), notes: z.string().max(50_000).nullable().optional(), status: z.enum(["Ativo", "Inativo"]).optional() }).parse(data);
  const [updated] = await db.update(documents).set(fields).where(and(eq(documents.id, id), eq(documents.documentType, "Modelo"), sql`NOT EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=${documents.id})`)).returning({ id: documents.id });
  if (!updated) throw new Error("Documento não encontrado.");
  revalidatePath("/documentos/modelos");
  revalidatePath("/documentos");
}

export async function deleteModelo(id: string) {
  await authorize("delete");
  const [deleted] = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.documentType, "Modelo"), sql`NOT EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=${documents.id})`)).returning({ id: documents.id });
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
