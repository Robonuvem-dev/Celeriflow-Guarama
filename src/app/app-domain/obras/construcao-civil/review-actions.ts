"use server";

import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { projectReviewSchema, reviewConstructionProject, resubmitConstructionProject } from "@/lib/obras/construction-review";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { setConstructionInspectionPlan } from "@/lib/obras/construction-lifecycle";
import { saveConstructionReviewWithInspectionPlan } from "@/lib/obras/construction-lifecycle-review";

function message(error: unknown) {
  return constructionActionMessage(error, error instanceof Error ? "Não foi possível salvar o parecer. Atualize a página e confira as referências." : "Não foi possível concluir a operação.");
}
export async function registerConstructionReview(input: unknown) {
  try {
    const data = projectReviewSchema.parse(input);
    const { inspectionTypeIds } = z.object({ inspectionTypeIds: z.array(z.string().trim().min(1)).max(100).optional() }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
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
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await resubmitConstructionProject(tx, access, data);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCase", targetId: data.caseId });
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
