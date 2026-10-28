import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { UnidadesClient } from "../components/UnidadesClient";
import type { Prisma } from "@prisma/client";
import { clampSanitationPage, parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  requested.pageSize = OPERATIONAL_PAGE_SIZE;
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

  return <UnidadesClient units={units} pagination={{ query, total }} />;
}
