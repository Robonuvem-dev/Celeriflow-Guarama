"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { issueScheduledAssessmentGuides } from "@/lib/tributacao/scheduled-guides";

export async function issueScheduledGuidesAction(input: Parameters<typeof issueScheduledAssessmentGuides>[2]) {
  try { const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); const result = await issueScheduledAssessmentGuides(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/calendarios"); revalidatePath("/tributacao/guias"); revalidatePath("/tributacao/resumo-anual"); return result; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir o calendário." }; }
}
