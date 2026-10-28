"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { defineMunicipalFiscalIndex, FiscalIndexError, type FiscalIndexCode, type FiscalIndexDefinition } from "@/lib/financeiro/fiscal-indices";
import { databaseConnection } from "@/db/client";

export async function defineFiscalIndexAction(input: { financialYearId: string; code: FiscalIndexCode; legalReference: string; minimumPercentage: string; effectiveFrom: string; reason: string; definition: FiscalIndexDefinition }): Promise<{ error?: string }> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const date = z.iso.date().parse(input.effectiveFrom);
    await defineMunicipalFiscalIndex(databaseConnection, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { ...input, effectiveFrom: new Date(`${date}T12:00:00Z`) });
    revalidatePath("/financeiro/relatorios/indices-constitucionais"); revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof FiscalIndexError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível registrar a composição fiscal." }; }
}
