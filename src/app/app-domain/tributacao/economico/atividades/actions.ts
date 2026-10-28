"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishEconomicActivity } from "@/lib/tributacao/economic-activity-registry";
import { unifyEconomicActivities } from "@/lib/tributacao/economic-activity-operations";

export async function publishEconomicActivityAction(input:Parameters<typeof publishEconomicActivity>[2]) {
  try {
    const {connection,user}=await taxActionContext("update");
    await publishEconomicActivity(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/economico/atividades");
    return {};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível publicar a atividade."};}
}

export async function unifyEconomicActivitiesAction(input:Parameters<typeof unifyEconomicActivities>[2]) {
  try {
    const {connection,user}=await taxActionContext("update");
    const result=await unifyEconomicActivities(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/economico/atividades");revalidatePath("/tributacao/economico");revalidatePath("/tributacao/economico/consulta");
    revalidatePath("/tributacao/configuracoes-cadastrais");
    return {data:result};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível unificar as atividades."};}
}
