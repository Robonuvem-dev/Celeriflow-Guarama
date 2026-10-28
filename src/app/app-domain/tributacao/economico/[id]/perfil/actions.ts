"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { createEconomicRegistrationWithProfile, saveEconomicProfile } from "@/lib/tributacao/economic-profile";

export async function saveEconomicProfileAction(input: Parameters<typeof saveEconomicProfile>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await saveEconomicProfile(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath(`/tributacao/economico/${input.registrationId}`); revalidatePath(`/tributacao/economico/${input.registrationId}/perfil`); revalidatePath("/tributacao/economico");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o perfil econômico." }; }
}

export async function createEconomicRegistrationWithProfileAction(input: Parameters<typeof createEconomicRegistrationWithProfile>[2]) {
  try {
    const { connection, user } = await taxActionContext("create");
    const row = await createEconomicRegistrationWithProfile(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/economico");
    return { id: row.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível incluir a empresa." }; }
}
