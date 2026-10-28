"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { HealthOperationError, runHealthTransaction } from "@/lib/saude/health-transaction";
import { and, eq, sql } from "drizzle-orm";
import { getPostgresError } from "@/db/errors";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { healthEntityIdSchema, healthProfessionalInputSchema, type HealthProfessionalInput } from "@/lib/saude/contract";

function revalidateHealthProfessionals() {
  for (const path of ["/app-domain/saude", "/app-domain/saude/profissionais", "/app-domain/saude/agenda", "/app-domain/saude/atendimentos"]) {
    revalidatePath(path);
  }
}

function hasErrorCode(error: unknown, code: string) {
  return getPostgresError(error)?.code === code;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Revise os campos informados.";
  if (error instanceof AccessError || error instanceof HealthOperationError) return error.message;
  if (hasErrorCode(error, "23505")) return "Este servidor ja esta cadastrado como profissional de saude.";
  return fallback;
}

export async function createHealthProfessional(data: HealthProfessionalInput) {
  try {
    const input = healthProfessionalInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    await runHealthTransaction(context, async tx => {
      const [employee] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1);
      if (!employee) throw new HealthOperationError("Selecione um servidor ativo do RH.");
      const [existing] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(eq(healthProfessionals.employeeId, input.employeeId)).limit(1);
      if (existing) throw new HealthOperationError("Este servidor ja esta cadastrado como profissional de saude.");
      const [professional] = await tx.insert(healthProfessionals).values({
          employeeId: input.employeeId,
          specialty: input.specialty,
          councilName: input.councilType,
          councilNumber: input.councilNumber,
          isActive: true,
      }).returning({ id: healthProfessionals.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL", targetId: professional.id });
    });
    revalidateHealthProfessionals();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel criar o profissional de saude. Os dados foram preservados.") };
  }
}

export async function updateHealthProfessional(id: string, data: HealthProfessionalInput) {
  try {
    const professionalId = healthEntityIdSchema.parse(id);
    const input = healthProfessionalInputSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [professional] = await tx.update(healthProfessionals).set({
          specialty: input.specialty,
          councilName: input.councilType,
          councilNumber: input.councilNumber,
      }).where(eq(healthProfessionals.id, professionalId)).returning({ id: healthProfessionals.id });
      if (!professional) throw new HealthOperationError("Profissional de saude nao encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL", targetId: professional.id });
    });
    revalidateHealthProfessionals();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel atualizar o profissional de saude. Os dados foram preservados.") };
  }
}

export async function toggleHealthProfessionalStatus(id: string, isActive: boolean) {
  try {
    const input = z.object({ id: healthEntityIdSchema, isActive: z.boolean() }).parse({ id, isActive });
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await runHealthTransaction(context, async tx => {
      const [professional] = await tx.select({ id: healthProfessionals.id, isActive: healthProfessionals.isActive, employee: { isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthProfessionals.id, input.id)).limit(1);
      if (!professional) throw new HealthOperationError("Profissional de saude nao encontrado.");
      if (input.isActive && !professional.employee.isActive) {
        throw new HealthOperationError("Nao e possivel ativar um profissional vinculado a um servidor inativo do RH.");
      }
      if (!input.isActive && professional.isActive) {
        const pendingAppointment = (await tx.execute(sql`SELECT id FROM "HealthAppointment" WHERE "professionalId"=${professional.id} AND status NOT IN ('Atendido','Faltou','Cancelado') LIMIT 1`)).rows[0];
        if (pendingAppointment) {
          throw new HealthOperationError("Nao e possivel inativar este profissional enquanto houver agendamentos pendentes vinculados a ele.");
        }
      }
      const [updated] = await tx.update(healthProfessionals).set({ isActive: input.isActive }).where(eq(healthProfessionals.id, professional.id)).returning({ id: healthProfessionals.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL", targetId: updated.id });
    });
    revalidateHealthProfessionals();
    return { success: true };
  } catch (error) {
    return { error: actionError(error, "Nao foi possivel alterar o status do profissional.") };
  }
}

export async function deleteHealthProfessional(id: string) {
  try {
    const professionalId = healthEntityIdSchema.parse(id);
    const context = await getTenantContextForModuleOperation("SAUDE", "delete");
    await runHealthTransaction(context, async tx => {
      const dependencies = await tx.execute(sql`SELECT id FROM "HealthAppointment" WHERE "professionalId"=${professionalId}
        UNION ALL SELECT id FROM "MedicalRecord" WHERE "professionalId"=${professionalId}
        UNION ALL SELECT id FROM "HealthPrescription" WHERE "professionalId"=${professionalId}
        UNION ALL SELECT id FROM "VaccinationRecord" WHERE "professionalId"=${professionalId}
        UNION ALL SELECT id FROM "HealthExamRequest" WHERE "professionalId"=${professionalId}
        UNION ALL SELECT id FROM "HealthReferral" WHERE "professionalId"=${professionalId} LIMIT 1`);
      if (dependencies.rows.length) {
        throw new HealthOperationError("Nao e possivel excluir este profissional pois ele possui prontuarios, agendamentos ou outros vinculos.");
      }
      const deleted = await tx.delete(healthProfessionals).where(eq(healthProfessionals.id, professionalId)).returning({ id: healthProfessionals.id });
      if (!deleted.length) throw new HealthOperationError("Profissional de saude nao encontrado.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_PROFESSIONAL", targetId: professionalId });
    });
    revalidateHealthProfessionals();
    return { success: true };
  } catch (error) {
    if (hasErrorCode(error, "23503")) return { error: "Nao e possivel excluir este profissional pois ele possui prontuarios, agendamentos ou outros vinculos." };
    return { error: actionError(error, "Nao foi possivel excluir este profissional.") };
  }
}
