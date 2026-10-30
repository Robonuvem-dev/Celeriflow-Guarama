"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { deleteReferenceRecord, referenceDefinitions, referenceKindSchema, saveReferenceRecord } from "@/lib/rh/reference-records";
export async function savePersonnelReference(data: FormData): Promise<{ error: string | null; message?: string }> {
  try {
    const id = String(data.get("id") || "");
    await getTenantContextForModuleOperation("RH", id ? "update" : "create");
    const kind = referenceKindSchema.parse(data.get("kind"));
    if (kind === "LICENCA_EDUCACAO") throw new Error("Utilize o cadastro de licenças da Educação.");
    const details = Object.fromEntries(referenceDefinitions[kind].fields.map(f => [f.name, String(data.get(f.name) || "").trim()]));
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      await saveReferenceRecord(tx, id || undefined, { kind, code: data.get("code"), name: data.get("name"), details });
    });
    revalidatePath("/rh/cadastros");
    return { error: null, message: "Cadastro salvo." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar." }; }
}
export async function deletePersonnelReference(data: FormData): Promise<void> {
  await getTenantContextForModuleOperation("RH", "delete");
  if (data.get("kind") === "LICENCA_EDUCACAO") throw new Error("Utilize o cadastro de licenças da Educação.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
    await deleteReferenceRecord(tx, String(data.get("id") || ""), referenceKindSchema.parse(data.get("kind")));
  });
  revalidatePath("/rh/cadastros");
}
