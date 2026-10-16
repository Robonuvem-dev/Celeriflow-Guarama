"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
import { exposureGroupInput } from "@/lib/sst/exposure-policy";
import { SstValidationError } from "@/lib/sst/errors";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function createSstExposureGroup(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const input = exposureGroupInput.parse({ ...Object.fromEntries(form), departmentIds: [...new Set(form.getAll("departmentIds").map(String))], roleIds: [...new Set(form.getAll("roleIds").map(String))] });
    assertBudgetUnitAccess(context.user, input.budgetUnitId);
    const id = await context.prisma.$transaction(async (tx) => {
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } });
      if (await tx.department.count({ where: { id: { in: input.departmentIds }, secretariatId: unit.secretariatId } }) !== input.departmentIds.length) throw new SstValidationError("Local de trabalho não pertence à secretaria da UG.");
      if (await tx.role.count({ where: { id: { in: input.roleIds }, isActive: true } }) !== input.roleIds.length) throw new SstValidationError("Cargo/função inválido ou inativo.");
      const group = await tx.sstExposureGroup.create({ data: { ...input, createdById: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_EXPOSURE_GROUP", targetId: group.id });
      return group.id;
    });
    revalidatePath("/sst/ghe"); revalidatePath("/app-domain/sst/ghe");
    return { error: null, id };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar o GHE. Confira o código e os dados." }; }
}
