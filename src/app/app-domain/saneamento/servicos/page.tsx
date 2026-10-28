import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Wrench } from "lucide-react";
import { ServicosClient } from "../components/ServicosClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import type { Prisma } from "@prisma/client";
import { clampSanitationPage, parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";

export default async function ServicosPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const where: Prisma.SanServiceOrderWhereInput = {
    ...(requested.status ? { status: requested.status } : {}),
    ...(requested.type ? { orderType: requested.type } : {}),
    ...(requested.q ? { OR: [
      { unit: { code: { contains: requested.q, mode: "insensitive" } } },
      ...["orderNumber", "orderType", "technician"].map((field) => ({ [field]: { contains: requested.q, mode: "insensitive" } })),
    ] } : {}),
  };
  const total = await prisma.sanServiceOrder.count({ where });
  const query = clampSanitationPage(requested, total);
  const orders = await prisma.sanServiceOrder.findMany({
      where,
      include: { unit: { select: { code: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
  });

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Serviços e Manutenção" icon={<Wrench className="size-4 shrink-0 text-[#0284C7]" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><ServicosClient orders={orders} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
