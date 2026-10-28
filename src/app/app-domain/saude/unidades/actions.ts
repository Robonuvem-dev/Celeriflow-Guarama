"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { HealthOperationError, runHealthTransaction } from "@/lib/saude/health-transaction";
import { eq, sql } from "drizzle-orm";
import { healthUnits } from "@/db/schema/health-workforce";
import { getPostgresError } from "@/db/errors";
import { healthEntityIdSchema, healthUnitInputSchema, type HealthUnitInput } from "@/lib/saude/contract";

function revalidateHealthUnits() {
  for (const path of ["/app-domain/saude", "/app-domain/saude/unidades", "/app-domain/saude/equipes", "/app-domain/saude/pacientes", "/app-domain/saude/agenda"]) {
    revalidatePath(path);
  }
}

function hasErrorCode(error: unknown, code: string) {
  return getPostgresError(error)?.code === code;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Revise os campos informados.";
  if (error instanceof AccessError || error instanceof HealthOperationError) return error.message;
  if (hasErrorCode(error, "23505")) return "Ja existe uma unidade cadastrada com este CNES.";
  return fallback;
}

export async function createHealthUnit(data: HealthUnitInput) {
  try {
    const input = healthUnitInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    await runHealthTransaction(context, async tx => {
      const [unit] = await tx.insert(healthUnits).values({ ...input, isActive: true }).returning({ id: healthUnits.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT", targetId: unit.id });
    });
    revalidateHealthUnits();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel criar a unidade de saude. Os dados foram preservados.") };
  }
}

export async function updateHealthUnit(id: string, data: HealthUnitInput) {
  try {
    const unitId = healthEntityIdSchema.parse(id);
    const input = healthUnitInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [updated] = await tx.update(healthUnits).set(input).where(eq(healthUnits.id, unitId)).returning({ id: healthUnits.id });
      if (!updated) throw new HealthOperationError("Unidade de saúde não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT", targetId: updated.id });
    });
    revalidateHealthUnits();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel atualizar a unidade de saude. Os dados foram preservados.") };
  }
}

export async function toggleHealthUnitStatus(id: string, isActive: boolean) {
  try {
    const input = z.object({ id: healthEntityIdSchema, isActive: z.boolean() }).parse({ id, isActive });
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [updated] = await tx.update(healthUnits).set({ isActive: input.isActive }).where(eq(healthUnits.id, input.id)).returning({ id: healthUnits.id });
      if (!updated) throw new HealthOperationError("Unidade de saúde não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT", targetId: updated.id });
    });
    revalidateHealthUnits();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel alterar o status da unidade.") };
  }
}

export async function deleteHealthUnit(id: string) {
  try {
    const unitId = healthEntityIdSchema.parse(id);
    const context = await getTenantContextForModuleOperation("SAUDE", "delete");
    await runHealthTransaction(context, async tx => {
      const dependencies = await tx.execute(sql`SELECT id FROM "HealthTeam" WHERE "unitId"=${unitId}
        UNION ALL SELECT id FROM "HealthProfessional" WHERE "unitId"=${unitId}
        UNION ALL SELECT id FROM "Patient" WHERE "referenceUnitId"=${unitId}
        UNION ALL SELECT id FROM "HealthAppointment" WHERE "unitId"=${unitId}
        UNION ALL SELECT id FROM "MedicalRecord" WHERE "unitId"=${unitId}
        UNION ALL SELECT id FROM "MedicineDispensation" WHERE "unitId"=${unitId}
        UNION ALL SELECT id FROM "VaccinationRecord" WHERE "unitId"=${unitId} LIMIT 1`);
      if (dependencies.rows.length) {
        throw new HealthOperationError("Nao e possivel excluir esta unidade pois ela possui vinculos no sistema.");
      }
      const deleted = await tx.delete(healthUnits).where(eq(healthUnits.id, unitId)).returning({ id: healthUnits.id });
      if (!deleted.length) throw new HealthOperationError("Unidade de saúde não encontrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_UNIT", targetId: unitId });
    });
    revalidateHealthUnits();
    return { success: true };
  } catch (error) {
    if (hasErrorCode(error, "23503")) return { error: "Nao e possivel excluir esta unidade pois ela possui vinculos no sistema." };
    return { error: actionError(error, "Nao foi possivel excluir esta unidade.") };
  }
}
