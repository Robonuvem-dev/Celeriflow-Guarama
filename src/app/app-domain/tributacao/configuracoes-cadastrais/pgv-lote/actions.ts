"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { bulkChangePgvCatalogs } from "@/lib/tributacao/pgv-bulk";

export async function bulkChangePgvAction(input: Parameters<typeof bulkChangePgvCatalogs>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    const rows = await bulkChangePgvCatalogs(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/configuracoes-cadastrais");
    revalidatePath("/tributacao/configuracoes-cadastrais/pgv-lote");
    return { count: rows.length };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar as PGVs." }; }
}
