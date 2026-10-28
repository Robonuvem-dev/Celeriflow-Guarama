import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Wrench } from "lucide-react";
import { ServicosClient } from "../components/ServicosClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { db } from "@/db/client";
import { listServiceOrders } from "@/db/repositories/sanitation/queries";

export default async function ServicosPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const { records: orders, total, query } = await listServiceOrders(context.database ?? db, requested);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Serviços e Manutenção" icon={<Wrench className="size-4 shrink-0 text-[#0284C7]" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><ServicosClient orders={orders} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
