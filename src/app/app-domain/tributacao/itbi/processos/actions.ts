"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { requestItbiContestation,decideItbiContestation } from "@/lib/tributacao/itbi-contestation";

export async function requestItbiContestationAction(input:Parameters<typeof requestItbiContestation>[2]) {
  try{const {connection,user}=await taxActionContext("update");await requestItbiContestation(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/itbi");revalidatePath("/tributacao/itbi/processos");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível solicitar a impugnação."};}
}
export async function decideItbiContestationAction(input:Parameters<typeof decideItbiContestation>[2]) {
  try{const {connection,user}=await taxActionContext("update");await decideItbiContestation(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/itbi");revalidatePath("/tributacao/itbi/processos");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível decidir a impugnação."};}
}
