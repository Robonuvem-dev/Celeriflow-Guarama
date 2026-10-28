"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { healthTeams, healthUnits } from "@/db/schema/health-workforce";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { HealthOperationError, runHealthTransaction } from "@/lib/saude/health-transaction";
import { healthEntityIdSchema, healthTeamInputSchema, type HealthTeamInput } from "@/lib/saude/contract";

function revalidateHealthTeams() {
  for (const path of ["/app-domain/saude", "/app-domain/saude/equipes", "/app-domain/saude/pacientes", "/app-domain/saude/agenda"]) {
    revalidatePath(path);
  }
}

function hasErrorCode(error: unknown, code: string) {
  return getPostgresError(error)?.code === code;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Revise os campos informados.";
  if (error instanceof AccessError || error instanceof HealthOperationError) return error.message;
  if (hasErrorCode(error, "23505")) return "Ja existe uma equipe cadastrada com este codigo.";
  return fallback;
}

async function requireActiveUnit(tx: DatabaseTransaction, unitId: string) {
  const [unit] = await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, unitId), eq(healthUnits.isActive, true))).limit(1);
  if (!unit) throw new HealthOperationError("Selecione uma unidade de saude ativa.");
}

export async function createHealthTeam(data: HealthTeamInput) {
  try {
    const input = healthTeamInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    await runHealthTransaction(context, async tx => {
      await requireActiveUnit(tx, input.unitId);
      const [team] = await tx.insert(healthTeams).values({ ...input, isActive: true }).returning({ id: healthTeams.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM", targetId: team.id });
    });
    revalidateHealthTeams();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel criar a equipe. Os dados foram preservados.") };
  }
}

export async function updateHealthTeam(id: string, data: HealthTeamInput) {
  try {
    const teamId = healthEntityIdSchema.parse(id);
    const input = healthTeamInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      await requireActiveUnit(tx, input.unitId);
      const [current] = await tx.select({ id: healthTeams.id, unitId: healthTeams.unitId }).from(healthTeams).where(eq(healthTeams.id, teamId)).limit(1);
      if (!current) throw new HealthOperationError("Equipe nao encontrada.");
      if (current.unitId !== input.unitId) {
        const dependencies = await tx.execute(sql`SELECT id FROM "Patient" WHERE "teamId"=${teamId} UNION ALL SELECT id FROM "HealthProfessional" WHERE "teamId"=${teamId} LIMIT 1`);
        if (dependencies.rows.length) {
          throw new HealthOperationError("Uma equipe com pacientes ou profissionais vinculados nao pode mudar de unidade.");
        }
      }
      const [team] = await tx.update(healthTeams).set(input).where(eq(healthTeams.id, teamId)).returning({ id: healthTeams.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM", targetId: team.id });
    });
    revalidateHealthTeams();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel atualizar a equipe. Os dados foram preservados.") };
  }
}

export async function toggleHealthTeamStatus(id: string, isActive: boolean) {
  try {
    const input = z.object({ id: healthEntityIdSchema, isActive: z.boolean() }).parse({ id, isActive });
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [team] = await tx.update(healthTeams).set({ isActive: input.isActive }).where(eq(healthTeams.id, input.id)).returning({ id: healthTeams.id });
      if (!team) throw new HealthOperationError("Equipe nao encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM", targetId: team.id });
    });
    revalidateHealthTeams();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel alterar o status da equipe.") };
  }
}

export async function deleteHealthTeam(id: string) {
  try {
    const teamId = healthEntityIdSchema.parse(id);
    const context = await getTenantContextForModuleOperation("SAUDE", "delete");
    await runHealthTransaction(context, async tx => {
      const dependencies = await tx.execute(sql`SELECT id FROM "Patient" WHERE "teamId"=${teamId} UNION ALL SELECT id FROM "HealthProfessional" WHERE "teamId"=${teamId} LIMIT 1`);
      if (dependencies.rows.length) {
        throw new HealthOperationError("Nao e possivel excluir esta equipe pois ela possui pacientes ou profissionais vinculados.");
      }
      const deleted = await tx.delete(healthTeams).where(eq(healthTeams.id, teamId)).returning({ id: healthTeams.id });
      if (!deleted.length) throw new HealthOperationError("Equipe nao encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM", targetId: teamId });
    });
    revalidateHealthTeams();
    return { success: true };
  } catch (error) {
    if (hasErrorCode(error, "23503")) return { error: "Nao e possivel excluir esta equipe pois ela possui vinculos." };
    return { error: actionError(error, "Nao foi possivel excluir esta equipe.") };
  }
}
