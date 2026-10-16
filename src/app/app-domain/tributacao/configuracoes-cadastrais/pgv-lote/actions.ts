"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { bulkChangePgvCatalogs } from "@/lib/tributacao/pgv-bulk";

export async function bulkChangePgvAction(input: Parameters<typeof bulkChangePgvCatalogs>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const rows = await bulkChangePgvCatalogs(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/configuracoes-cadastrais");
    revalidatePath("/tributacao/configuracoes-cadastrais/pgv-lote");
    return { count: rows.length };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar as PGVs." }; }
}
