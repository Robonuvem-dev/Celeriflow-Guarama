"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModule, getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { SstValidationError } from "@/lib/sst/errors";

export async function saveSstPlannedShift(form: FormData) {
  try {
    await getTenantContextForModule("SST");
    const context = await getTenantContextForModuleOperation("RH", "create");
    const input = z.object({ budgetUnitId: z.string().min(1), employeeId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((item) => item.endsAt > item.startsAt && item.endsAt.getTime() - item.startsAt.getTime() <= 24 * 3600000, "Informe um turno de até 24 horas.").parse(Object.fromEntries(form));
    assertBudgetUnitAccess(context.user, input.budgetUnitId);
    const id = await context.prisma.$transaction(async (tx) => {
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } });
      const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee || employee.secretariatId !== unit.secretariatId) throw new SstValidationError("Lotação incompatível com a unidade gestora.");
      const shift = await tx.sstPlannedShift.upsert({ where: { budgetUnitId_employeeId_startsAt_endsAt: input }, create: { ...input, roleIdSnapshot: employee.roleId, departmentIdSnapshot: employee.departmentId, createdById: context.user.id }, update: {} });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "RH_PLANNED_SHIFT", targetId: shift.id });
      return shift.id;
    });
    revalidatePath("/sst/jornadas"); revalidatePath("/app-domain/sst/jornadas");
    return { error: null, id };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar a jornada." }; }
}
