"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { classifyBenefitForAnnualReport } from "@/lib/tributacao/annual-tax-summary";

export async function classifyBenefitReportAction(input: Parameters<typeof classifyBenefitForAnnualReport>[2]) {
  try { const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await classifyBenefitForAnnualReport(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/resumo-anual"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível classificar o benefício." }; }
}
