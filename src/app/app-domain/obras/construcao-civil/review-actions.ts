"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { projectReviewSchema, reviewConstructionProject, resubmitConstructionProject } from "@/lib/obras/construction-review";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { setConstructionInspectionPlan } from "@/lib/obras/construction-lifecycle";
import { saveConstructionReviewWithInspectionPlan } from "@/lib/obras/construction-lifecycle-review";

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return "Não foi possível salvar o parecer. Atualize a página e confira as referências.";
  return error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação.";
}
export async function registerConstructionReview(input: unknown) {
  try {
    const data = projectReviewSchema.parse(input);
    const { inspectionTypeIds } = z.object({ inspectionTypeIds: z.array(z.string().trim().min(1)).max(100).optional() }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    await context.prisma.$transaction(async (tx) => {
      const id = await saveConstructionReviewWithInspectionPlan(data, inspectionTypeIds, {
        review: () => reviewConstructionProject(tx, access, context.user.id, data),
        plan: (plan) => setConstructionInspectionPlan(tx, access, context.user.id, plan),
      });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionReview", targetId: id });
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`);
    revalidatePath(`/obras/construcao-civil/${data.caseId}/ciclo`);
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function resubmitConstructionCase(input: unknown) {
  try {
    const data = z.object({ caseId: z.string().min(1), revision: z.number().int().nonnegative(), notes: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    await context.prisma.$transaction(async (tx) => {
      await resubmitConstructionProject(tx, access, data);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCase", targetId: data.caseId });
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
