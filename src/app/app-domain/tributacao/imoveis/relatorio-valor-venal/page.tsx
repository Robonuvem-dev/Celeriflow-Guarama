import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readVenalValueReport, type VenalReportFilters } from "./repository";
import RelatorioValorVenalClient from "./RelatorioValorVenalClient";

export const dynamic = "force-dynamic";

export default async function RelatorioValorVenalPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const params = await searchParams;

  const filters: VenalReportFilters = {
    localityMode: (typeof params.locality === "string" ? params.locality : "TODOS") as any,
    taxpayerId: typeof params.taxpayerId === "string" ? params.taxpayerId : undefined,
    statusMode: (typeof params.status === "string" ? params.status : "TODOS") as any,
    onlyWithVenalValue: params.onlyVenal === "true"
  };

  const [taxpayers, reportData] = await Promise.all([
    listPageTaxpayers(database, { active: true, order: "created-asc", limit: 300 }),
    readVenalValueReport(database, filters)
  ]);

  const taxpayerOptions = taxpayers.map(tp => ({
    id: tp.id,
    label: tp.company?.corporateName ?? tp.person?.fullName ?? tp.id
  }));

  return (
    <RelatorioValorVenalClient
      taxpayers={taxpayerOptions}
      reportData={reportData}
      filters={filters}
    />
  );
}
