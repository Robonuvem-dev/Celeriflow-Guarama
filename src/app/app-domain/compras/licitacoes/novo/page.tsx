import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LicitacaoForm } from "../LicitacaoForm";
import { databaseConnection } from "@/db/client";
import { listBiddingProcesses } from "@/db/repositories/procurement/bidding";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { desc } from "drizzle-orm";

export default async function NovaLicitacaoPage() {
  await getTenantContextForModule("COMPRAS");
  const [processos, availableRequests] = await Promise.all([
    listBiddingProcesses(databaseConnection.db),
    databaseConnection.db
      .select({
        id: purchaseRequests.id,
        number: purchaseRequests.number,
        object: purchaseRequests.object,
        estimatedValue: purchaseRequests.estimatedValue,
        status: purchaseRequests.status,
      })
      .from(purchaseRequests)
      .orderBy(desc(purchaseRequests.number))
      .limit(50),
  ]);

  return (
    <LicitacaoForm
      processos={processos.map(({ items, ...process }) => ({
        ...process,
        itemLabels: items.map((item) =>
          item.catalogItem
            ? `${item.catalogItem.code} · ${item.catalogItem.name} · ${item.quantity} ${item.catalogItem.unit}`
            : item.customName || "Item livre"
        ),
      }))}
      expenseRequests={availableRequests}
    />
  );
}
