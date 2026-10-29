import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { FaturasClient } from "../components/FaturasClient";
import { parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { db } from "@/db/client";
import { listInvoices } from "@/db/repositories/sanitation/queries";

export default async function FaturasPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const { records: invoices, total, query } = await listInvoices(context.database ?? db, requested);

  const serialized = invoices.map((inv) => ({
    ...inv,
    dueDate: inv.dueDate.toISOString(),
  }));

  return <FaturasClient invoices={serialized} pagination={{ query, total }} />;
}
