import { ProcessoForm } from "../ProcessoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listActiveProcessCatalog, listUnprocessedApprovedRequests } from "@/db/repositories/procurement/purchase-processes";

export default async function NovoProcessoPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const [catalogItems, purchaseRequests] = await Promise.all([
    listActiveProcessCatalog(context.database ?? db),
    listUnprocessedApprovedRequests(context.database ?? db),
  ]);

  return <ProcessoForm
    catalogItems={catalogItems}
    purchaseRequests={purchaseRequests.map((request) => ({
      id: request.id,
      number: request.number,
      object: request.object,
      estimatedValue: request.estimatedValue,
      secretariatId: request.secretariatId,
      secretariatName: request.secretariat.acronym || request.secretariat.name,
      itemCount: request._count.items,
      itemLabels: request.items.map(item => item.catalogItem ? `${item.catalogItem.code} · ${item.catalogItem.name} · ${item.quantity} ${item.catalogItem.unit}` : item.customName || "Item livre"),
    }))}
  />;
}
