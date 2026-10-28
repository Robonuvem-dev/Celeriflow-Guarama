"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getProtocolContextForOperation, protocolScopeCondition } from "@/lib/protocols/access";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { processes } from "@/db/schema/processes";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { accessProfiles, users } from "@/db/schema/identity";
import { citizenTrackingEligibleCondition } from "@/db/repositories/processes/details";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

const grantSchema = z.object({
  processId: z.string().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  reason: z.string().trim().min(10, "Descreva o vínculo autorizado (mínimo de 10 caracteres).").max(1000),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
});

async function accessContext(processId: string) {
  const context = await getProtocolContextForOperation("update");
  const [process] = await db.select({ id: processes.id, currentDepartmentId: processes.currentDepartmentId }).from(processes).where(and(eq(processes.id, processId), protocolScopeCondition(context), citizenTrackingEligibleCondition())).limit(1);
  if (!process || (!context.protocolAccess.isAdmin && (!context.user.employeeId || !context.user.departmentId || context.user.departmentId !== process.currentDepartmentId))) {
    throw new Error("Somente o setor atual ou a administração pode gerenciar o acompanhamento deste processo.");
  }
  return context;
}

function refreshAccess(processId: string) {
  revalidatePath(`/protocolos/processos/${processId}`);
  revalidatePath(`/app-domain/protocolos/processos/${processId}`);
  revalidatePath("/portal/minha-area/processos");
  revalidatePath(`/portal/minha-area/processos/${processId}`);
}

// Called with await by the client panel: preserve the UI error contract.
export async function grantCitizenProcessAccess(formData: FormData): Promise<{ error: string | null }> {
  try {
    const input = grantSchema.parse(Object.fromEntries(formData));
    const expiresAt = input.expiresAt ? new Date(`${input.expiresAt}T23:59:59.999Z`) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== input.expiresAt || expiresAt <= new Date())) throw new Error("Informe uma data de validade futura.");
    const context = await accessContext(input.processId);
    const [viewer] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.email, input.email), eq(users.ativo, true), isNotNull(users.firebaseUid), eq(accessProfiles.ativo, true))).limit(1);
    if (!viewer) throw new Error("O e-mail precisa pertencer a uma conta municipal ativa e vinculada ao login.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [access] = await tx.insert(processCitizenAccesses).values({ processId: input.processId, usuarioId: viewer.id, grantedByUsuarioId: context.user.id, reason: input.reason, expiresAt }).onConflictDoUpdate({ target: [processCitizenAccesses.processId, processCitizenAccesses.usuarioId], set: { grantedByUsuarioId: context.user.id, reason: input.reason, expiresAt, revokedAt: null, grantedAt: new Date() } }).returning({ id: processCitizenAccesses.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_PROCESS_ACCESS_GRANTED", targetId: access.id });
    }, { timeoutMs: 5_000 });
    refreshAccess(input.processId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof Error ? error.message : "Não foi possível liberar o acompanhamento." };
  }
}

export async function revokeCitizenProcessAccess(processId: string, accessId: string): Promise<{ error: string | null }> {
  try {
    const context = await accessContext(processId);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const result = await tx.update(processCitizenAccesses).set({ revokedAt: new Date() }).where(and(eq(processCitizenAccesses.id, accessId), eq(processCitizenAccesses.processId, processId), isNull(processCitizenAccesses.revokedAt))).returning({ id: processCitizenAccesses.id });
      if (!result.length) throw new Error("Autorização não encontrada ou já revogada.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_PROCESS_ACCESS_REVOKED", targetId: accessId });
    }, { timeoutMs: 5_000 });
    refreshAccess(processId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível revogar o acompanhamento." };
  }
}
