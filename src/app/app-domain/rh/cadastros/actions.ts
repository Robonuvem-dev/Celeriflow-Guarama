"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { databaseConnection } from "@/db/client";
import { eq, sql } from "drizzle-orm";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { enqueueHrIntegration } from "@/db/repositories/personnel/integration";
import { withDatabaseTransaction } from "@/db/transaction";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { deleteReferenceRecord, referenceDefinitions, referenceKindSchema, saveReferenceRecord } from "@/lib/rh/reference-records";
export async function savePersonnelReference(data: FormData): Promise<{ error: string | null; message?: string }> {
  try {
    const id = String(data.get("id") || "");
    const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
    const kind = referenceKindSchema.parse(data.get("kind"));
    if (kind === "LICENCA_EDUCACAO") throw new Error("Utilize o cadastro de licenças da Educação.");
    const details = Object.fromEntries(referenceDefinitions[kind].fields.map(f => [f.name, String(data.get(f.name) || "").trim()]));
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      const [before] = id ? await tx.select().from(hrReferenceRecords).where(eq(hrReferenceRecords.id, id)) : [];
      const after = await saveReferenceRecord(tx, id || undefined, { kind, code: data.get("code"), name: data.get("name"), details });
      await enqueueHrIntegration(tx, { sourceKey: `REFERENCIA_RH:${after.id}:${randomUUID()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "REFERENCIA_RH_SALVA", payload: { actorId: context.user.id, before: before ?? null, after } });
    });
    revalidatePath("/rh/cadastros");
    return { error: null, message: "Cadastro salvo." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar." }; }
}
export async function deletePersonnelReference(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  if (data.get("kind") === "LICENCA_EDUCACAO") throw new Error("Utilize o cadastro de licenças da Educação.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
    const id = String(data.get("id") || "");
    const [before] = await tx.select().from(hrReferenceRecords).where(eq(hrReferenceRecords.id, id));
    await deleteReferenceRecord(tx, id, referenceKindSchema.parse(data.get("kind")));
    await enqueueHrIntegration(tx, { sourceKey: `REFERENCIA_RH:EXCLUSAO:${id}:${randomUUID()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "REFERENCIA_RH_EXCLUIDA", payload: { actorId: context.user.id, before: before! } });
  });
  revalidatePath("/rh/cadastros");
}
