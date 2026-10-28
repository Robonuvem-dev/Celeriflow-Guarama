import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ProcessoForm } from "../../ProcessoForm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { listActiveProcessCatalog, loadPurchaseProcessForEdit } from "@/db/repositories/procurement/purchase-processes";

export default async function EditarProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const processoPromise = loadPurchaseProcessForEdit(context.database ?? db, resolvedParams.id);
  
  const catalogItemsPromise = listActiveProcessCatalog(context.database ?? db);

  const [processo, catalogItems] = await Promise.all([processoPromise, catalogItemsPromise]);

  if (!processo) {
    notFound();
  }

  const mappedProcesso = {
    ...processo,
    items: processo.items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId ?? (item.customName ? "custom" : ""),
      customName: item.customName ?? "",
      quantity: item.quantity,
      estimatedUnitValue: item.estimatedUnitValue ?? 0,
      sourceLocked: item.requestItemOrigins.length > 0,
    }))
  };

  return <ProcessoForm data={mappedProcesso} catalogItems={catalogItems} />;
}
