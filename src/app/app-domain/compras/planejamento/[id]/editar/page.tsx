import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPurchasePlannings, loadPurchasePlanningOptions } from "@/db/repositories/procurement/purchase-planning";
import { PlanningForm } from "../../PlanningForm";

export default async function EditarPlanejamentoComprasPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  const { id } = await params;
  const [[planning], { catalogItems, purchaseRequests }] = await Promise.all([
    listPurchasePlannings(context.database ?? db, id),
    loadPurchasePlanningOptions(context.database ?? db),
  ]);

  if (!planning) notFound();

  return <PlanningForm
    catalogItems={catalogItems}
    purchaseRequests={purchaseRequests}
    data={{
      id: planning.id,
      description: planning.description,
      catalogItemId: planning.catalogItemId,
      originPurchaseRequestId: planning.originPurchaseRequestId,
      unit: planning.unit,
      quantity: planning.quantity,
      expectedPeriodStart: planning.expectedPeriodStart.toISOString().slice(0, 10),
      expectedPeriodEnd: planning.expectedPeriodEnd.toISOString().slice(0, 10),
      estimatedValueDecimal: Number(planning.estimatedValueDecimal),
      status: planning.status,
    }}
  />;
}
