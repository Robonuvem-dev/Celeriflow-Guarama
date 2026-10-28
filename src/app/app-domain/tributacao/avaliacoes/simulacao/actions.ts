"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { assessPropertySimulation } from "@/lib/tributacao/property-simulation-assessment";

export async function assessPropertySimulationAction(input:Parameters<typeof assessPropertySimulation>[2]) {
  try {
    const {connection,user}=await taxActionContext("create");
    const result=await assessPropertySimulation(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/guias");revalidatePath("/tributacao/imoveis");
    return {id:result.id,number:result.assessmentNumber};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível efetivar o lançamento da simulação."};}
}
