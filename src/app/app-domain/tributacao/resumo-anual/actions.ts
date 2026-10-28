"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { classifyBenefitForAnnualReport } from "@/lib/tributacao/annual-tax-summary";

export async function classifyBenefitReportAction(input: Parameters<typeof classifyBenefitForAnnualReport>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await classifyBenefitForAnnualReport(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/resumo-anual"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível classificar o benefício." }; }
}
