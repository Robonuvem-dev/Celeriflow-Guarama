"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
import { exposureGroupInput } from "@/lib/sst/exposure-policy";
import { SstValidationError } from "@/lib/sst/errors";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, eq, inArray } from "drizzle-orm";
import { sstExposureGroups } from "@/db/schema/sst-programs";
import { departments, roles } from "@/db/schema/administration";
import { findSstUnit } from "@/db/repositories/sst/scope";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstContextConnection } from "@/lib/sst/database";

export async function createSstExposureGroup(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const input = exposureGroupInput.parse({ ...Object.fromEntries(form), departmentIds: [...new Set(form.getAll("departmentIds").map(String))], roleIds: [...new Set(form.getAll("roleIds").map(String))] });
    assertBudgetUnitAccess(context.user, input.budgetUnitId);
    const id = await withDatabaseTransaction(sstContextConnection(context), async (tx) => {
      const unit = await findSstUnit(tx, input.budgetUnitId);
      if (!unit) throw new SstValidationError("Unidade gestora não encontrada.");
      if ((await tx.select({ id: departments.id }).from(departments).where(and(inArray(departments.id, input.departmentIds), eq(departments.secretariatId, unit.secretariatId)))).length !== input.departmentIds.length) throw new SstValidationError("Local de trabalho não pertence à secretaria da UG.");
      if ((await tx.select({ id: roles.id }).from(roles).where(and(inArray(roles.id, input.roleIds), eq(roles.isActive, true)))).length !== input.roleIds.length) throw new SstValidationError("Cargo/função inválido ou inativo.");
      const [group] = await tx.insert(sstExposureGroups).values({ ...input, createdById: context.user.id }).returning({ id: sstExposureGroups.id });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_EXPOSURE_GROUP", targetId: group.id });
      return group.id;
    });
    revalidatePath("/sst/ghe"); revalidatePath("/app-domain/sst/ghe");
    return { error: null, id };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar o GHE. Confira o código e os dados." }; }
}
