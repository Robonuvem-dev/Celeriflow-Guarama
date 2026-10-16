"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publishItbiExpiryPolicy, cancelOverdueItbiProcesses } from "@/lib/tributacao/itbi-expiry";

export async function publishItbiExpiryPolicyAction(input: Parameters<typeof publishItbiExpiryPolicy>[2]) {
  try { const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await publishItbiExpiryPolicy(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/cancelamento-automatico"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a política." }; }
}
export async function executeItbiExpiryAction(input: Parameters<typeof cancelOverdueItbiProcesses>[2]) {
  try { const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); const result = await cancelOverdueItbiProcesses(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi"); revalidatePath("/tributacao/itbi/cancelamento-automatico"); return { result }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível processar os vencimentos." }; }
}
