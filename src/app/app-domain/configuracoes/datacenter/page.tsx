import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import {
  getDataCenterGovernanceOverview,
  type DataCenterRequirementItem,
} from "@/lib/platform/datacenter-governance";
import { DataCenterClient } from "./DataCenterClient";

export const dynamic = "force-dynamic";

export default async function DataCenterConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getTenantContextForModule("CONFIGURACOES");
  const resolved = await searchParams;
  const rawCat = typeof resolved.categoria === "string" ? resolved.categoria : "ALL";
  const validCategories: ReadonlyArray<DataCenterRequirementItem["category"]> = [
    "CERTIFICACAO_E_DISPONIBILIDADE",
    "REDE_DNS_SSL",
    "SEGURANCA_FISICA_E_VIRTUAL",
    "OPERACAO_LICENCIAMENTO_E_SUPORTE",
  ];
  const activeCategory = validCategories.includes(rawCat as DataCenterRequirementItem["category"])
    ? (rawCat as DataCenterRequirementItem["category"])
    : "ALL";

  const page = Math.max(1, Number(resolved.page ?? 1) || 1);
  const overview = getDataCenterGovernanceOverview();

  return (
    <DataCenterClient
      initialTelemetry={overview.telemetry}
      certifications={overview.certifications}
      requirements={overview.requirements}
      activeCategory={activeCategory}
      page={page}
    />
  );
}

