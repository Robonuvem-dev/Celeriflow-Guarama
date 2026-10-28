"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { bulkChangeEconomicProfiles } from "@/lib/tributacao/economic-operations";

export async function bulkChangeEconomicProfilesAction(input: Parameters<typeof bulkChangeEconomicProfiles>[2]) {
  try {
    const {connection,user}=await taxActionContext("update");
    const result=await bulkChangeEconomicProfiles(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/economico"); revalidatePath("/tributacao/economico/alteracao-geral"); revalidatePath("/tributacao/economico/consulta");
    return {data:result};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível alterar os cadastros econômicos."};}
}
