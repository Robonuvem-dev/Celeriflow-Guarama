"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { bulkChangeProperties, copyProperties, reorganizeProperties } from "@/lib/tributacao/property-operations";

async function context(operation: "create" | "update" = "update") {
  const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", operation);
  return { prisma, actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } };
}
function refresh() { revalidatePath("/tributacao/imoveis"); revalidatePath("/tributacao/imoveis/operacoes"); }

export async function bulkChangePropertiesAction(input: Parameters<typeof bulkChangeProperties>[2]) {
  try { const { prisma, actor } = await context(); const data = await bulkChangeProperties(prisma, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar os imóveis." }; }
}
export async function copyPropertiesAction(input: Parameters<typeof copyProperties>[2]) {
  try { const { prisma, actor } = await context("create"); const data = await copyProperties(prisma, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível copiar os imóveis." }; }
}
export async function reorganizePropertiesAction(input: Parameters<typeof reorganizeProperties>[2]) {
  try { await context("create"); const { prisma, actor } = await context(); const data = await reorganizeProperties(prisma, actor, input); refresh(); return { data }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível reorganizar os imóveis." }; }
}
