"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publishItbiEntryPolicy } from "@/lib/tributacao/itbi-entry-policy";

export async function publishItbiEntryPolicyAction(input: Parameters<typeof publishItbiEntryPolicy>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await publishItbiEntryPolicy(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/bloqueios"); revalidatePath("/tributacao/itbi"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a política de inclusão." }; }
}
