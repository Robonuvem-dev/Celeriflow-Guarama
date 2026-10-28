"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { approvePropertyEdit, publishPropertyEditRestriction } from "@/lib/tributacao/property-edit-restrictions";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

async function supervisor() {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  const { user } = context;
  if (!isSystemAdministrator(user)) throw new Error("Operação exclusiva do supervisor administrativo habilitado.");
  return { connection: taxActionConnection(context), actor: { usuarioId: user.id, employeeId: user.employeeId } };
}
export async function publishPropertyEditRestrictionAction(input: Parameters<typeof publishPropertyEditRestriction>[2]) {
  try { const { actor, connection } = await supervisor(); await publishPropertyEditRestriction(connection, actor, input); revalidatePath(`/tributacao/imoveis/${input.propertyId}/bloqueio`); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o bloqueio." }; }
}
export async function approvePropertyEditAction(input: Parameters<typeof approvePropertyEdit>[2]) {
  try { const { actor, connection } = await supervisor(); await approvePropertyEdit(connection, actor, input); revalidatePath(`/tributacao/imoveis/${input.propertyId}/bloqueio`); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível autorizar a alteração." }; }
}
