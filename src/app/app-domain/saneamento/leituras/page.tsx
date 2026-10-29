import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LeiturasClient } from "../components/LeiturasClient";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { consumerUnitPeriod } from "@/lib/saneamento/unit-code";
import { db } from "@/db/client";
import { listMeterReadings } from "@/db/repositories/sanitation/queries";

export default async function LeiturasPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const currentPeriod = consumerUnitPeriod(new Date());
  requested.year = /^(20\d{2})$/.test(requested.year) ? requested.year : currentPeriod.slice(0, 4);
  requested.month = /^(0[1-9]|1[0-2])$/.test(requested.month) ? requested.month : currentPeriod.slice(4);
  const { records: readings, total, query } = await listMeterReadings(context.database ?? db, requested);

  return <LeiturasClient readings={readings} pagination={{ query, total }} />;
}
