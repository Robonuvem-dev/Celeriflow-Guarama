"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { approvePropertyEdit, publishPropertyEditRestriction } from "@/lib/tributacao/property-edit-restrictions";

async function supervisor() {
  const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  if (!isSystemAdministrator(user)) throw new Error("Operação exclusiva do supervisor administrativo habilitado.");
  return { prisma, actor: { usuarioId: user.id, employeeId: user.employeeId } };
}
export async function publishPropertyEditRestrictionAction(input: Parameters<typeof publishPropertyEditRestriction>[2]) {
  try { const { prisma, actor } = await supervisor(); await publishPropertyEditRestriction(prisma, actor, input); revalidatePath(`/tributacao/imoveis/${input.propertyId}/bloqueio`); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o bloqueio." }; }
}
export async function approvePropertyEditAction(input: Parameters<typeof approvePropertyEdit>[2]) {
  try { const { prisma, actor } = await supervisor(); await approvePropertyEdit(prisma, actor, input); revalidatePath(`/tributacao/imoveis/${input.propertyId}/bloqueio`); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível autorizar a alteração." }; }
}
