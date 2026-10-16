"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { definePersonnelFiscalComposition, PersonnelFiscalError, personnelFiscalDefinitionInput } from "@/lib/financeiro/personnel-fiscal";

export async function definePersonnelFiscalAction(input: z.infer<typeof personnelFiscalDefinitionInput>) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await definePersonnelFiscalComposition(prisma, { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/financeiro/relatorios/pessoal-fiscal"); revalidatePath("/financeiro/relatorios");
    return {};
  } catch (error) { return { error: error instanceof PersonnelFiscalError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível registrar a composição fiscal de pessoal." }; }
}
