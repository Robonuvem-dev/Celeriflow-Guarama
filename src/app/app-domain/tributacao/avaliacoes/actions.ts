"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publishPropertyValuationRule, saveConfiguredPropertyValuation } from "@/lib/tributacao/property-valuation";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

export async function publishValuationRuleAction(input: Parameters<typeof publishPropertyValuationRule>[2]) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await publishPropertyValuationRule(taxActionConnection(context), { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/avaliacoes");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar a regra." }; }
}

export async function saveValuationAction(input: Parameters<typeof saveConfiguredPropertyValuation>[2]) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await saveConfiguredPropertyValuation(taxActionConnection(context), { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/avaliacoes");
    revalidatePath(`/tributacao/imoveis/${input.realEstateId}`);
    revalidatePath("/tributacao/lotes-anuais");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar a avaliação." }; }
}
