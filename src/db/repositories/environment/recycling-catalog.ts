import { and, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { recyclingEntryKey, type RecyclingEntry } from "@/lib/environment/recycling-catalog";

/** The caller authorizes and validates the entry, then supplies its transaction.
 * Keep the catalog mutation and its audit event atomic, using the existing key
 * and lock namespace so entries written before this extraction remain compatible.
 */
export async function saveRecyclingCatalogEntry(tx: DatabaseTransaction, input: {
  instanceId: string;
  actorUsuarioId: string;
  mode: "create" | "update";
  entry: RecyclingEntry;
}): Promise<void> {
  const { instanceId, actorUsuarioId, mode, entry } = input;
  const key = recyclingEntryKey(entry);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${instanceId + key}))`);
  const [existing] = await tx.select({ id: instanceParameters.id }).from(instanceParameters).where(and(
    eq(instanceParameters.configuracaoInstanciaId, instanceId),
    eq(instanceParameters.chave, key),
  ));
  if (mode === "create" && existing) throw new Error("Código já cadastrado neste catálogo. Edite o registro existente.");
  if (mode === "update" && !existing) throw new Error("Registro não encontrado.");
  if (existing) await tx.update(instanceParameters).set({ valor: entry, updatedAt: new Date() }).where(eq(instanceParameters.id, existing.id));
  else await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instanceId, chave: key, valor: entry });
  await insertAuditEvent(tx, {
    actorUsuarioId,
    eventType: auditEventTypes.administrativeMutation,
    targetType: "RecyclingCatalog",
    targetId: `${instanceId}:${key}`,
  });
}
