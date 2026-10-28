import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { loadPurchasePlanningOptions } from "@/db/repositories/procurement/purchase-planning";
import { PlanningForm } from "../PlanningForm";

export default async function NovoPlanejamentoComprasPage() {
  const context = await getTenantContextForModuleOperation("COMPRAS", "create");
  const { catalogItems, purchaseRequests } = await loadPurchasePlanningOptions(context.database ?? db);

  return <PlanningForm catalogItems={catalogItems} purchaseRequests={purchaseRequests} />;
}
