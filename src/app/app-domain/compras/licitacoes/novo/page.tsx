import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LicitacaoForm } from "../LicitacaoForm";
import { databaseConnection } from "@/db/client";
import { listBiddingProcesses } from "@/db/repositories/procurement/bidding";

export default async function NovaLicitacaoPage() {
  await getTenantContextForModule("COMPRAS");
  const processos = await listBiddingProcesses(databaseConnection.db);

  return <LicitacaoForm processos={processos.map(({ items, ...process }) => ({ ...process, itemLabels: items.map(item => item.catalogItem ? `${item.catalogItem.code} · ${item.catalogItem.name} · ${item.quantity} ${item.catalogItem.unit}` : item.customName || "Item livre") }))} />;
}
