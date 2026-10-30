import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { SolicitacaoForm } from "../../SolicitacaoForm";
import { notFound } from "next/navigation";
import { canManagePurchaseRequest, canSelectAnyPurchaseRequestOrigin, purchaseRequestOriginScope } from "@/lib/compras/purchase-request-policy";
import { db } from "@/db/client";
import { loadPurchaseRequestFormOptions } from "@/db/repositories/procurement/purchase-requests";
import { loadPurchaseRequestsWithAllocations } from "@/db/repositories/procurement/lifecycle";
import { loadExternalAdhesion } from "@/db/repositories/procurement/external-adhesion";

export default async function EditarSolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const [solicitacao] = await loadPurchaseRequestsWithAllocations(context.database ?? db, [resolvedParams.id]);

  if (!solicitacao || !canManagePurchaseRequest(context.user, solicitacao)) {
    notFound();
  }
  const origin = purchaseRequestOriginScope(context.user);
  const canSelectAnyOrigin = canSelectAnyPurchaseRequestOrigin(context.user);
  const { catalogItems, secretarias, departments, budgetAppropriations } = await loadPurchaseRequestFormOptions(context.database ?? db, {
    origin, canSelectAnyOrigin, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds,
  });

  const mappedSolicitacao = {
    ...solicitacao,
    externalAdhesion: await loadExternalAdhesion(context.database ?? db, solicitacao.id),
    items: solicitacao.items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId ?? (item.customName ? "custom" : ""),
      customName: item.customName ?? "",
      quantity: item.quantity,
      estimatedUnitValue: item.estimatedUnitValue ?? 0,
      allocations: item.budgetAllocations.map((allocation) => ({
        budgetAppropriationId: allocation.budgetAppropriationId,
        quantity: allocation.quantity,
        value: allocation.valueDecimal.toNumber(),
      })),
    }))
  };

  return <SolicitacaoForm
    data={mappedSolicitacao}
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
