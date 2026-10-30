"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { withDatabaseTransaction } from "@/db/transaction";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { recyclingEntryKey, recyclingEntrySchema } from "@/lib/environment/recycling-catalog";

export async function saveRecyclingEntry(form: FormData): Promise<void> {
  const mode = form.get("mode") === "update" ? "update" : "create";
  const context = await getTenantContextForModuleOperation("MEIO_AMBIENTE", mode);
  const entry = recyclingEntrySchema.parse({ kind: form.get("kind"), code: form.get("code"), name: form.get("name"), description: form.get("description") || "", address: form.get("address") || "", active: form.get("active") === "on" });
  const instance = await findOperationalInstance(context.database ?? db);
  if (!instance) throw new Error("Configure a instância municipal antes de cadastrar os materiais.");
  const key = recyclingEntryKey(entry);
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${instance.id + key}))`);
    const [existing] = await tx.select({ id: instanceParameters.id }).from(instanceParameters).where(and(eq(instanceParameters.configuracaoInstanciaId, instance.id), eq(instanceParameters.chave, key)));
    if (mode === "create" && existing) throw new Error("Código já cadastrado neste catálogo. Edite o registro existente.");
    if (mode === "update" && !existing) throw new Error("Registro não encontrado.");
    if (existing) await tx.update(instanceParameters).set({ valor: entry, updatedAt: new Date() }).where(eq(instanceParameters.id, existing.id));
    else await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: key, valor: entry });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "RecyclingCatalog", targetId: `${instance.id}:${key}` });
  });
  revalidatePath("/meio-ambiente/residuos/cadastros");
}
