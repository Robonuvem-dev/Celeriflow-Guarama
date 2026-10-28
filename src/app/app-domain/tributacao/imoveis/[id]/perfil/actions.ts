"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { createPropertyWithProfile,savePropertyProfile } from "@/lib/tributacao/property-profile";

export async function savePropertyProfileAction(input: Parameters<typeof savePropertyProfile>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await savePropertyProfile(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath(`/tributacao/imoveis/${input.propertyId}/perfil`); revalidatePath(`/tributacao/imoveis/${input.propertyId}`); revalidatePath("/tributacao/imoveis");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o perfil imobiliário." }; }
}

export async function createPropertyWithProfileAction(input:Parameters<typeof createPropertyWithProfile>[2]) {
  try {
    const {connection,user}=await taxActionContext("create");
    const row=await createPropertyWithProfile(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/imoveis");revalidatePath("/cadastros/imoveis");
    return {id:row.id};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível incluir o imóvel completo."};}
}
