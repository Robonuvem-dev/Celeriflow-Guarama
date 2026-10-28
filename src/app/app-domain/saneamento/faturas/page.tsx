import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Receipt } from "lucide-react";
import { FaturasClient } from "../components/FaturasClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
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

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Contas de Água e Esgoto" icon={<Receipt className="size-4 shrink-0 text-[#0284C7]" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><FaturasClient invoices={serialized} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
