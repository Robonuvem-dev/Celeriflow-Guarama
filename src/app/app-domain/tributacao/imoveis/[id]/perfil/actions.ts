"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { createPropertyWithProfile,savePropertyProfile } from "@/lib/tributacao/property-profile";

export async function savePropertyProfileAction(input: Parameters<typeof savePropertyProfile>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await savePropertyProfile(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath(`/tributacao/imoveis/${input.propertyId}/perfil`); revalidatePath(`/tributacao/imoveis/${input.propertyId}`); revalidatePath("/tributacao/imoveis");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o perfil imobiliário." }; }
}

export async function createPropertyWithProfileAction(input:Parameters<typeof createPropertyWithProfile>[2]) {
  try {
    const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","create");
    const row=await createPropertyWithProfile(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);
    revalidatePath("/tributacao/imoveis");revalidatePath("/cadastros/imoveis");
    return {id:row.id};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível incluir o imóvel completo."};}
}
