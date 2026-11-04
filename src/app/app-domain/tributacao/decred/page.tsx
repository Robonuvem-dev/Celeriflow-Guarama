import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getDecredOverviewState } from "@/lib/tributacao/card-administrators-decred-service";
import { DecredClient } from "./DecredClient";

export const dynamic = "force-dynamic";

export default async function DecredPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getTenantContextForModule("TRIBUTACAO");
  const resolved = await searchParams;
  const rawTab = typeof resolved.aba === "string" ? resolved.aba : "equipamentos";
  const activeTab =
    rawTab === "declaracoes" ||
    rawTab === "relatorio-natureza" ||
    rawTab === "relatorio-equipamentos" ||
    rawTab === "termo"
      ? rawTab
      : "equipamentos";

  const page = Math.max(1, Number(resolved.page ?? 1) || 1);
  const state = getDecredOverviewState();

  return (
    <DecredClient
      initialEquipments={state.equipments}
      initialTerms={state.terms}
      initialDeclarations={state.declarations}
      initialDams={state.dams}
      initialReportByNatureza={state.reportByNatureza}
      initialReportEquipments={state.reportEquipments}
      responsibilityTermText={state.responsibilityTermText}
      activeTab={activeTab}
      page={page}
    />
  );
}

