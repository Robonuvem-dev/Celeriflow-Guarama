"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishItbiEntryPolicy } from "@/lib/tributacao/itbi-entry-policy";

export async function publishItbiEntryPolicyAction(input: Parameters<typeof publishItbiEntryPolicy>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await publishItbiEntryPolicy(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/bloqueios"); revalidatePath("/tributacao/itbi"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a política de inclusão." }; }
}
