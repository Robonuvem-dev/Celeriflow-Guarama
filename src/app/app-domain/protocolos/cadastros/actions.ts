"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import { processSubjects } from "@/db/schema/processes";
import { getProtocolContextForOperation } from "@/lib/protocols/access";
import { processReferenceSchema } from "@/lib/protocols/reference-catalog";
export async function saveProcessReference(form: FormData): Promise<void> {
  const id = String(form.get("id") || "");
  const context = await getProtocolContextForOperation(id ? "update" : "create");
  const database = context.database ?? db;
  const data = processReferenceSchema.parse({ kind: form.get("kind"), name: form.get("name"), description: String(form.get("description") || "") || null, subjectId: String(form.get("subjectId") || "") || null, isActive: form.get("isActive") === "on" });
  if (data.subjectId) {
    const [subject] = await database.select({ id: processSubjects.id }).from(processSubjects).where(eq(processSubjects.id, data.subjectId)).limit(1);
    if (!subject) throw new Error("Assunto não encontrado.");
  }
  if (id) {
    const [existing] = await database.select({ id: processReferenceCatalog.id }).from(processReferenceCatalog).where(and(eq(processReferenceCatalog.id, id), eq(processReferenceCatalog.kind, data.kind))).limit(1);
    if (!existing) throw new Error("Cadastro não encontrado nesta categoria.");
    await database.update(processReferenceCatalog).set(data).where(eq(processReferenceCatalog.id, id));
  } else await database.insert(processReferenceCatalog).values(data);
  revalidatePath("/protocolos/cadastros");
}
