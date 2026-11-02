"use server";

import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { saveRecyclingCatalogEntry } from "@/db/repositories/environment/recycling-catalog";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { recyclingEntrySchema, type RecyclingCatalogSaveResult } from "@/lib/environment/recycling-catalog";

export async function saveRecyclingEntry(form: FormData): Promise<void> {
  const mode = form.get("mode") === "update" ? "update" : "create";
  const context = await getTenantContextForModuleOperation("MEIO_AMBIENTE", mode);
  const entry = recyclingEntrySchema.parse({ kind: form.get("kind"), code: form.get("code"), name: form.get("name"), description: form.get("description") || "", address: form.get("address") || "", active: form.get("active") === "on" });
  const instance = await findOperationalInstance(context.database ?? db);
  if (!instance) throw new Error("Configure a instância municipal antes de cadastrar os materiais.");
  await withDatabaseTransaction(databaseConnection, tx => saveRecyclingCatalogEntry(tx, {
    instanceId: instance.id,
    actorUsuarioId: context.user.id,
    mode,
    entry,
  }));
  revalidatePath("/meio-ambiente/residuos/cadastros");
}

// Adapter for the awaited client form; the existing Promise<void> action is preserved.
export async function saveRecyclingEntryForClient(form: FormData): Promise<RecyclingCatalogSaveResult> {
  try {
    await saveRecyclingEntry(form);
    return { success: true };
  } catch {
    return { error: "Não foi possível salvar o cadastro. Confira os dados, se o código já existe e suas permissões antes de tentar novamente." };
  }
}
