"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { publishAccountant } from "@/lib/tributacao/accountants";

export async function publishAccountantAction(input: Parameters<typeof publishAccountant>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await publishAccountant(prisma, { usuarioId: user.id, employeeId: user.employeeId }, input);
    revalidatePath("/tributacao/economico/contadores");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o contador." }; }
}
