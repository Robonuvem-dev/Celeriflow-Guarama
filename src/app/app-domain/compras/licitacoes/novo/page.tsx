import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LicitacaoForm } from "../LicitacaoForm";

export default async function NovaLicitacaoPage() {
  const { prisma } = await getTenantContextForModule("COMPRAS");
  const processos = await prisma.purchaseProcess.findMany({
    orderBy: { number: 'desc' },
    include: { items: { select: { customName: true, quantity: true, catalogItem: { select: { code: true, name: true, unit: true } } } } },
  });

  return <LicitacaoForm processos={processos.map(({ items, ...process }) => ({ ...process, itemLabels: items.map(item => item.catalogItem ? `${item.catalogItem.code} · ${item.catalogItem.name} · ${item.quantity} ${item.catalogItem.unit}` : item.customName || "Item livre") }))} />;
}
