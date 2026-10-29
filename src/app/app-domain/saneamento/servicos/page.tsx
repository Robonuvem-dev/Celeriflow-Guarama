import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ServicosClient } from "../components/ServicosClient";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { db } from "@/db/client";
import { listServiceOrders } from "@/db/repositories/sanitation/queries";

export default async function ServicosPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const { records: orders, total, query } = await listServiceOrders(context.database ?? db, requested);

  return <ServicosClient orders={orders} pagination={{ query, total }} />;
}
