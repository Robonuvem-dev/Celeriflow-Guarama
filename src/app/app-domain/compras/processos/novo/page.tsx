import { ProcessoForm } from "../ProcessoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function NovoProcessoPage() {
  const { prisma } = await getTenantContextForModule("COMPRAS");
  const [catalogItems, purchaseRequests] = await Promise.all([
    prisma.catalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.purchaseRequest.findMany({
      where: {
        status: "Aprovada",
        purchaseProcesses: { none: {} },
        processOrigins: { none: {} },
      },
      select: {
        id: true,
        number: true,
        object: true,
        estimatedValue: true,
        secretariatId: true,
        secretariat: { select: { acronym: true, name: true } },
        _count: { select: { items: true } },
        items: { select: { customName: true, quantity: true, catalogItem: { select: { code: true, name: true, unit: true } } } },
      },
      orderBy: { approvedAt: 'desc' },
    }),
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
