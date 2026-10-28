import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import { PlanningListClient } from "./PlanningListClient";

export default async function PlanejamentoComprasPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const { user } = context;
  const plannings = await listPurchasePlannings(context.database ?? db);

  return <PlanningListClient
    canCreate={canPerformModuleOperation(user, "COMPRAS", "create")}
    canUpdate={canPerformModuleOperation(user, "COMPRAS", "update")}
    plannings={plannings.map((planning) => ({
      id: planning.id,
      itemName: planning.catalogItem?.name ?? planning.description ?? "Item sem especificação",
      description: planning.catalogItem ? planning.description : null,
      unit: planning.unit,
      quantity: planning.quantity,
      expectedPeriodStart: planning.expectedPeriodStart.toISOString(),
      expectedPeriodEnd: planning.expectedPeriodEnd.toISOString(),
      estimatedValueDecimal: Number(planning.estimatedValueDecimal),
      status: planning.status,
      originId: planning.originPurchaseRequest?.id ?? null,
      originNumber: planning.originPurchaseRequest?.number ?? null,
      originObject: planning.originPurchaseRequest?.object ?? null,
    }))}
  />;
}
