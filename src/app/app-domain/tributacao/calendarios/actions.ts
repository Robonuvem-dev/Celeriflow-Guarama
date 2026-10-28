"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { issueScheduledAssessmentGuides } from "@/lib/tributacao/scheduled-guides";

export async function issueScheduledGuidesAction(input: Parameters<typeof issueScheduledAssessmentGuides>[2]) {
  try { const { connection, user } = await taxActionContext("create"); const result = await issueScheduledAssessmentGuides(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/calendarios"); revalidatePath("/tributacao/guias"); revalidatePath("/tributacao/resumo-anual"); return result; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir o calendário." }; }
}
