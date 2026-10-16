"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { publishConstructionTaxRule, issueConstructionFee } from "@/lib/obras/construction-taxation";

function errorMessage(error: unknown) {
  return error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação tributária.";
}
export async function publishConstructionTaxRuleAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Publicação exige gestor urbanístico.");
    await context.prisma.$transaction((tx) => publishConstructionTaxRule(tx, context.user.id, input));
    revalidatePath("/obras/construcao-civil/taxas");
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function issueConstructionFeeAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    const access = await resolveConstructionAccess(context);
    const id = await issueConstructionFee(context.prisma, access, { usuarioId: context.user.id, employeeId: context.user.employeeId }, input);
    revalidatePath("/obras/construcao-civil/taxas");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
