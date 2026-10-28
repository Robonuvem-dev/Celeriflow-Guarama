import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { FileText } from "lucide-react";
import { LeiturasClient } from "../components/LeiturasClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import type { Prisma } from "@prisma/client";
import { clampSanitationPage, parseSanitationQuery, type SanitationSearchParams } from "@/lib/saneamento/list-query";
import { consumerUnitPeriod } from "@/lib/saneamento/unit-identifier";

export default async function LeiturasPage({ searchParams }: { searchParams: Promise<SanitationSearchParams> }) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const requested = parseSanitationQuery(await searchParams);
  const currentPeriod = consumerUnitPeriod(new Date());
  requested.year = /^(20\d{2})$/.test(requested.year) ? requested.year : currentPeriod.slice(0, 4);
  requested.month = /^(0[1-9]|1[0-2])$/.test(requested.month) ? requested.month : currentPeriod.slice(4);
  const where: Prisma.SanMeterReadingWhereInput = {
    competence: `${requested.month}/${requested.year}`,
    ...(requested.status ? { status: requested.status } : {}),
    ...(requested.q ? { OR: [
      { unit: { code: { contains: requested.q, mode: "insensitive" } } },
      { competence: { contains: requested.q, mode: "insensitive" } },
      { readerName: { contains: requested.q, mode: "insensitive" } },
    ] } : {}),
  };
  const total = await prisma.sanMeterReading.count({ where });
  const query = clampSanitationPage(requested, total);
  const readings = await prisma.sanMeterReading.findMany({
      where,
      include: { unit: { select: { code: true } } },
      orderBy: [{ readingDate: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
  });

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Leituras e Consumo" icon={<FileText className="size-4 shrink-0 text-emerald-500" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><LeiturasClient readings={readings} pagination={{ query, total }} /></div>
    </PageFrame>
  );
}
