"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { schoolSubjects } from "@/db/schema/education-core";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
export async function saveSchoolSubject(data: FormData): Promise<{ error: string | null; message?: string }> {
 try {
  const id = String(data.get("id") || "");
  const context = await getTenantContextForModuleOperation("EDUCACAO", id ? "update" : "create");
  const values = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(200), abbreviation: z.string().trim().min(1).max(30) }).parse(Object.fromEntries(["code","name","abbreviation"].map(k => [k, String(data.get(k) || "")])));
  const database = context.database ?? db;
  if (id) {
   const [saved] = await database.update(schoolSubjects).set(values).where(eq(schoolSubjects.id,id)).returning({ id: schoolSubjects.id });
   if (!saved) throw new Error("Disciplina não encontrada.");
  } else await database.insert(schoolSubjects).values(values);
  revalidatePath("/educacao/disciplinas"); revalidatePath("/educacao/academico");
  return { error: null, message: "Disciplina salva." };
 } catch(error) { return { error: error instanceof Error ? error.message : "Falha ao salvar disciplina." }; }
}
