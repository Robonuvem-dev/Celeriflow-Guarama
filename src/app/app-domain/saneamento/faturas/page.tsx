import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Receipt } from "lucide-react";
import { FaturasClient } from "../components/FaturasClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import type { Prisma } from "@prisma/client";
import { clampSanitationPage, parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";

export default async function FaturasPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const where: Prisma.SanInvoiceWhereInput = {
    ...(requested.status ? { status: requested.status } : {}),
    ...(requested.q ? { OR: [
      { unit: { code: { contains: requested.q, mode: "insensitive" } } },
      { invoiceNumber: { contains: requested.q, mode: "insensitive" } },
      { competence: { contains: requested.q, mode: "insensitive" } },
    ] } : {}),
  };
  const total = await prisma.sanInvoice.count({ where });
  const query = clampSanitationPage(requested, total);
  const invoices = await prisma.sanInvoice.findMany({
    where,
    select: {
      id: true,
      invoiceNumber: true,
      competence: true,
      totalAmount: true,
      dueDate: true,
      status: true,
      unit: { select: { code: true } },
    },
    orderBy: [{ dueDate: "desc" }, { id: "asc" }],
    skip: (query.page - 1) * query.pageSize, take: query.pageSize,
  });

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
