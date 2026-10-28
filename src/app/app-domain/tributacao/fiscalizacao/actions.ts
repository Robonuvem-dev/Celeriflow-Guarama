"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { withDatabaseTransaction } from "@/db/transaction";
import { taxInfractions } from "@/db/schema/taxation-core";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

async function getContext(operation: ModuleOperation) {
  return getTenantContextForModuleOperation("TRIBUTACAO", operation);
}

export async function createInfraction(data: {
  infractionType: string;
  penaltyValue: number;
  defenseDeadline?: string;
  taxpayerId: string;
}) {
  const context = await getContext("create");
  const result = await withDatabaseTransaction(taxActionConnection(context), async tx => {
    const [record] = await tx.insert(taxInfractions).values({
      infractionType: data.infractionType,
      penaltyValue: data.penaltyValue,
      defenseDeadline: data.defenseDeadline ? new Date(data.defenseDeadline) : undefined,
      taxpayerId: data.taxpayerId,
      status: "Emitido"
    }).returning();
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "Infraction", targetId: record.id });
    return record;
  });

  revalidatePath("/tributacao/fiscalizacao");
  return result;
}

export async function updateInfraction(id: string, data: {
  infractionType?: string;
  penaltyValue?: number;
  defenseDeadline?: string;
}) {
  const context = await getContext("update");
  const result = await withDatabaseTransaction(taxActionConnection(context), async tx => {
    const [record] = await tx.update(taxInfractions).set({
      infractionType: data.infractionType,
      penaltyValue: data.penaltyValue,
      defenseDeadline: data.defenseDeadline ? new Date(data.defenseDeadline) : undefined,
    }).where(eq(taxInfractions.id, id)).returning();
    if (!record) throw new Error("Auto de infração não encontrado.");
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "Infraction", targetId: record.id });
    return record;
  });

  revalidatePath("/tributacao/fiscalizacao");
  return result;
}

export async function updateInfractionStatus(id: string, status: string) {
  const context = await getContext("update");
  const result = await withDatabaseTransaction(taxActionConnection(context), async tx => {
    const [record] = await tx.update(taxInfractions).set({ status }).where(eq(taxInfractions.id, id)).returning();
    if (!record) throw new Error("Auto de infração não encontrado.");
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "Infraction", targetId: record.id });
    return record;
  });

  revalidatePath("/tributacao/fiscalizacao");
  return result;
}
