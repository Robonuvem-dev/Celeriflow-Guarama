"use server"

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { officialDiaries } from "@/db/schema/portal-content";

export async function createDiary(data: FormData) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
  const editionNumberStr = data.get("editionNumber") as string;
  const pdfUrl = data.get("pdfUrl") as string;
  const status = data.get("status") as string;

  const editionNumber = parseInt(editionNumberStr);

  if (isNaN(editionNumber) || !pdfUrl) {
    throw new Error("Número da edição e link do PDF são obrigatórios.");
  }

  // Check if edition already exists
  const [existing] = await db.select({ id: officialDiaries.id }).from(officialDiaries).where(eq(officialDiaries.editionNumber, editionNumber)).limit(1);

  if (existing) {
    throw new Error("Já existe uma edição com este número.");
  }

  await db.insert(officialDiaries).values({
      editionNumber,
      pdfUrl,
      status,
      publishDate: new Date(),
  });

  revalidatePath("/transparencia/diario-oficial");
}

export async function deleteDiary(id: string) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "delete");
  if (!(await db.delete(officialDiaries).where(eq(officialDiaries.id, id)).returning({ id: officialDiaries.id })).length) throw new Error("Edição não encontrada.");
  revalidatePath("/transparencia/diario-oficial");
}
