"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { requestItbiContestation,decideItbiContestation } from "@/lib/tributacao/itbi-contestation";

export async function requestItbiContestationAction(input:Parameters<typeof requestItbiContestation>[2]) {
  try{const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","update");await requestItbiContestation(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/itbi");revalidatePath("/tributacao/itbi/processos");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível solicitar a impugnação."};}
}
export async function decideItbiContestationAction(input:Parameters<typeof decideItbiContestation>[2]) {
  try{const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","update");await decideItbiContestation(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/itbi");revalidatePath("/tributacao/itbi/processos");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível decidir a impugnação."};}
}
