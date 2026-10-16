"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getProtocolContextForOperation, protocolScope } from "@/lib/protocols/access";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

const grantSchema = z.object({
  processId: z.string().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  reason: z.string().trim().min(10, "Descreva o vínculo autorizado (mínimo de 10 caracteres).").max(1000),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
});

async function accessContext(processId: string) {
  const context = await getProtocolContextForOperation("update");
  const process = await context.prisma.process.findFirst({
    where: { AND: [{ id: processId }, protocolScope(context)], ombudsman: { is: null }, functionalPortalBinding: { is: null }, sstCertificates: { none: {} } },
    select: { id: true, currentDepartmentId: true },
  });
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
    const viewer = await context.prisma.usuario.findFirst({ where: { email: input.email, ativo: true, firebaseUid: { not: null }, perfil: { ativo: true } }, select: { id: true } });
    if (!viewer) throw new Error("O e-mail precisa pertencer a uma conta municipal ativa e vinculada ao login.");
    await context.prisma.$transaction(async (tx) => {
      const access = await tx.processCitizenAccess.upsert({
        where: { processId_usuarioId: { processId: input.processId, usuarioId: viewer.id } },
        create: { processId: input.processId, usuarioId: viewer.id, grantedByUsuarioId: context.user.id, reason: input.reason, expiresAt },
        update: { grantedByUsuarioId: context.user.id, reason: input.reason, expiresAt, revokedAt: null, grantedAt: new Date() },
      });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_PROCESS_ACCESS_GRANTED", targetId: access.id });
    });
    refreshAccess(input.processId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof Error ? error.message : "Não foi possível liberar o acompanhamento." };
  }
}

export async function revokeCitizenProcessAccess(processId: string, accessId: string): Promise<{ error: string | null }> {
  try {
    const context = await accessContext(processId);
    await context.prisma.$transaction(async (tx) => {
      const result = await tx.processCitizenAccess.updateMany({ where: { id: accessId, processId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!result.count) throw new Error("Autorização não encontrada ou já revogada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CITIZEN_PROCESS_ACCESS_REVOKED", targetId: accessId });
    });
    refreshAccess(processId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível revogar o acompanhamento." };
  }
}
