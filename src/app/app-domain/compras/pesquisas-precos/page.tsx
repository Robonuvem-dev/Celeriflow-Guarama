import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPriceResearches } from "@/db/repositories/procurement/price-research";
import { PriceResearchListClient } from "./PriceResearchListClient";

export default async function PriceResearchPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const researches = await listPriceResearches(context.database ?? db);

  return <PriceResearchListClient researches={researches.map((research) => ({
    id: research.id,
    status: research.status,
    deadlineAt: research.date.toISOString(),
    estimatedValue: research.estimatedValue,
    process: {
      number: research.process.number,
      object: research.process.object,
      purchaseRequestNumber: research.process.purchaseRequest?.number ?? null,
    },
    submittedQuoteCount: research._count.quotes,
  }))} />;
}
