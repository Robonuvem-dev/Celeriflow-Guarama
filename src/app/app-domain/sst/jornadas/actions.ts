"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModule, getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, eq } from "drizzle-orm";
import { sstPlannedShifts } from "@/db/schema/sst-agenda";
import { findSstUnit, findSstEmployee } from "@/db/repositories/sst/scope";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstContextConnection } from "@/lib/sst/database";
import { SstValidationError } from "@/lib/sst/errors";

export async function saveSstPlannedShift(form: FormData) {
  try {
    await getTenantContextForModule("SST");
    const context = await getTenantContextForModuleOperation("RH", "create");
    const input = z.object({ budgetUnitId: z.string().min(1), employeeId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((item) => item.endsAt > item.startsAt && item.endsAt.getTime() - item.startsAt.getTime() <= 24 * 3600000, "Informe um turno de até 24 horas.").parse(Object.fromEntries(form));
    assertBudgetUnitAccess(context.user, input.budgetUnitId);
    const id = await withDatabaseTransaction(sstContextConnection(context), async (tx) => {
      const unit = await findSstUnit(tx, input.budgetUnitId), employee = await findSstEmployee(tx, input.employeeId);
      if (!unit || !employee || employee.secretariatId !== unit.secretariatId) throw new SstValidationError("Lotação incompatível com a unidade gestora.");
      const inserted = await tx.insert(sstPlannedShifts).values({ ...input, roleIdSnapshot: employee.roleId, departmentIdSnapshot: employee.departmentId, createdById: context.user.id }).onConflictDoNothing({ target: [sstPlannedShifts.budgetUnitId, sstPlannedShifts.employeeId, sstPlannedShifts.startsAt, sstPlannedShifts.endsAt] }).returning({ id: sstPlannedShifts.id });
      const shift = inserted[0] ?? (await tx.select({ id: sstPlannedShifts.id }).from(sstPlannedShifts).where(and(eq(sstPlannedShifts.budgetUnitId, input.budgetUnitId), eq(sstPlannedShifts.employeeId, input.employeeId), eq(sstPlannedShifts.startsAt, input.startsAt), eq(sstPlannedShifts.endsAt, input.endsAt))))[0];
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "RH_PLANNED_SHIFT", targetId: shift.id });
      return shift.id;
    });
    revalidatePath("/sst/jornadas"); revalidatePath("/app-domain/sst/jornadas");
    return { error: null, id };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar a jornada." }; }
}
