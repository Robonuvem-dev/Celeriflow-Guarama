"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishItbiExpiryPolicy, cancelOverdueItbiProcesses } from "@/lib/tributacao/itbi-expiry";

export async function publishItbiExpiryPolicyAction(input: Parameters<typeof publishItbiExpiryPolicy>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await publishItbiExpiryPolicy(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/cancelamento-automatico"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a política." }; }
}
export async function executeItbiExpiryAction(input: Parameters<typeof cancelOverdueItbiProcesses>[2]) {
  try { const { connection, user } = await taxActionContext("update"); const result = await cancelOverdueItbiProcesses(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi"); revalidatePath("/tributacao/itbi/cancelamento-automatico"); return { result }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível processar os vencimentos." }; }
}
