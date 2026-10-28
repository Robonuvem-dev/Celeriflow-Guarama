"use server";

import { revalidatePath } from "next/cache";
import { publishAccountant } from "@/lib/tributacao/accountants";
import { taxActionContext } from "@/db/repositories/tax-actions/context";

export async function publishAccountantAction(input: Parameters<typeof publishAccountant>[2]) {
  try {
    const { user, connection } = await taxActionContext("update");
    await publishAccountant(connection, { usuarioId: user.id, employeeId: user.employeeId }, input);
    revalidatePath("/tributacao/economico/contadores");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o contador." }; }
}
