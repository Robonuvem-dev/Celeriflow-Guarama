"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishOnlineItbiPolicy, configureItbiNotary } from "@/lib/tributacao/itbi-online";

export async function publishOnlineItbiPolicyAction(input: Parameters<typeof publishOnlineItbiPolicy>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await publishOnlineItbiPolicy(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/online"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a configuração." }; }
}
export async function configureItbiNotaryAction(input: Parameters<typeof configureItbiNotary>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await configureItbiNotary(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/online"); revalidatePath("/portal/tributario/itbi/novo"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o tabelionato." }; }
}
