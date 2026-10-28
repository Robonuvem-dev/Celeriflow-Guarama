import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { UnidadesClient } from "../components/UnidadesClient";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { db } from "@/db/client";
import { listConsumerUnits } from "@/db/repositories/sanitation/queries";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  requested.pageSize = OPERATIONAL_PAGE_SIZE;
  const { records: units, total, query } = await listConsumerUnits(context.database ?? db, requested);

  return <UnidadesClient units={units} pagination={{ query, total }} />;
}
