"use server";

import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { publishConstructionTaxRule, issueConstructionFee } from "@/lib/obras/construction-taxation";

function errorMessage(error: unknown) {
  return constructionActionMessage(error, "Não foi possível concluir a operação tributária.");
}
export async function publishConstructionTaxRuleAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Publicação exige gestor urbanístico.");
    await withDatabaseTransaction(databaseConnection, (tx) => publishConstructionTaxRule(tx, context.user.id, input));
    revalidatePath("/obras/construcao-civil/taxas");
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function issueConstructionFeeAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    const access = await resolveConstructionAccess(context);
    const id = await issueConstructionFee(databaseConnection, access, { usuarioId: context.user.id, employeeId: context.user.employeeId }, input);
    revalidatePath("/obras/construcao-civil/taxas");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
