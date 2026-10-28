import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Droplets } from "lucide-react";
import { UnidadesClient } from "../components/UnidadesClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { db } from "@/db/client";
import { listConsumerUnits } from "@/db/repositories/sanitation/queries";

export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const { records: units, total, query } = await listConsumerUnits(context.database ?? db, requested);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Unidades Consumidoras" icon={<Droplets className="size-4 shrink-0 text-[#0284C7]" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 min-w-0 flex-1"><UnidadesClient units={units} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
