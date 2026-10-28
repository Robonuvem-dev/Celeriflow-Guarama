import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Droplets } from "lucide-react";
import { UnidadesClient } from "../components/UnidadesClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import type { Prisma } from "@prisma/client";
import { clampSanitationPage, parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";

export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const where: Prisma.SanConsumerUnitWhereInput = {
    ...(requested.status ? { status: requested.status } : {}),
    ...(requested.category ? { category: requested.category } : {}),
    ...(requested.q ? { OR: ["code", "address", "ownerName", "neighborhood", "postalCode"].map((field) => ({ [field]: { contains: requested.q, mode: "insensitive" } })) } : {}),
  };
  const total = await prisma.sanConsumerUnit.count({ where });
  const query = clampSanitationPage(requested, total);
  const units = await prisma.sanConsumerUnit.findMany({
    where,
    select: {
      id: true,
      code: true,
      address: true,
      streetAddress: true,
      neighborhood: true,
      postalCode: true,
      category: true,
      status: true,
      ownerName: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Unidades Consumidoras" icon={<Droplets className="size-4 shrink-0 text-[#0284C7]" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 min-w-0 flex-1"><UnidadesClient units={units} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
