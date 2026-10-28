"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { bulkChangeProperties, copyProperties, reorganizeProperties } from "@/lib/tributacao/property-operations";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

async function context(operation: "create" | "update" = "update") {
  const tenant = await getTenantContextForModuleOperation("TRIBUTACAO", operation);
  const { user } = tenant;
  return { connection: taxActionConnection(tenant), actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } };
}
function refresh() { revalidatePath("/tributacao/imoveis"); revalidatePath("/tributacao/imoveis/operacoes"); }

export async function bulkChangePropertiesAction(input: Parameters<typeof bulkChangeProperties>[2]) {
  try { const { connection, actor } = await context(); const data = await bulkChangeProperties(connection, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar os imóveis." }; }
}
export async function copyPropertiesAction(input: Parameters<typeof copyProperties>[2]) {
  try { const { connection, actor } = await context("create"); const data = await copyProperties(connection, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível copiar os imóveis." }; }
}
export async function reorganizePropertiesAction(input: Parameters<typeof reorganizeProperties>[2]) {
  try { await context("create"); const { connection, actor } = await context(); const data = await reorganizeProperties(connection, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível reorganizar os imóveis." }; }
}
