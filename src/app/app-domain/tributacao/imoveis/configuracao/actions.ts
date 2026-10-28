"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishPropertyRegistrationPolicy } from "@/lib/tributacao/property-profile";

export async function publishPropertyRegistrationPolicyAction(input: Parameters<typeof publishPropertyRegistrationPolicy>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    if (!isSystemAdministrator(user)) throw new Error("A configuração dos controles cadastrais exige supervisor administrativo.");
    await publishPropertyRegistrationPolicy(connection, { usuarioId: user.id, employeeId: user.employeeId }, input);
    revalidatePath("/tributacao/imoveis/configuracao");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a configuração imobiliária." }; }
}
