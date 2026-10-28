import { SolicitacaoForm } from "../SolicitacaoForm";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { canSelectAnyPurchaseRequestOrigin, purchaseRequestOriginScope } from "@/lib/compras/purchase-request-policy";
import { db } from "@/db/client";
import { loadPurchaseRequestFormOptions } from "@/db/repositories/procurement/purchase-requests";

export default async function NovaSolicitacaoPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const origin = purchaseRequestOriginScope(context.user);
  const canSelectAnyOrigin = canSelectAnyPurchaseRequestOrigin(context.user);
   const { catalogItems, secretarias, departments, budgetAppropriations } = await loadPurchaseRequestFormOptions(context.database ?? db, {
     origin, canSelectAnyOrigin, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds,
   });

  return <SolicitacaoForm
    catalogItems={catalogItems}
    secretarias={secretarias}
    departments={departments}
    budgetAppropriations={budgetAppropriations.map((appropriation) => ({
      id: appropriation.id,
      code: appropriation.code,
      secretariatId: appropriation.budgetUnit.secretariatId,
      budgetUnitName: appropriation.budgetUnit.name,
      expenseNatureCode: appropriation.expenseNature.code,
      expenseNatureName: appropriation.expenseNature.name,
      resourceSourceCode: appropriation.resourceSource.code,
      resourceSourceName: appropriation.resourceSource.name,
      financialYear: appropriation.financialYear.year,
    }))}
    initialOrigin={origin}
    originLocked={!canSelectAnyOrigin}
  />;
}
