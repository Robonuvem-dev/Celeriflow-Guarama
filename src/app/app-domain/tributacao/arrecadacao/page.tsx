import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { loadFebrabanStateFromDb } from "@/lib/platform/tributacao-infra-persistence";
import type { FebrabanDebtNature } from "@/lib/tributacao/febraban-arrecadacao-service";
import { ArrecadacaoOnlineClient } from "./ArrecadacaoOnlineClient";

export const dynamic = "force-dynamic";

export default async function ArrecadacaoOnlinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getTenantContextForModule("TRIBUTACAO");
  const resolved = await searchParams;
  const rawView = typeof resolved.visao === "string" ? resolved.visao : "guias";
  const activeView: "guias" | "logs" = rawView === "logs" ? "logs" : "guias";

  const rawNature = typeof resolved.natureza === "string" ? resolved.natureza : "ALL";
  const activeNature: "ALL" | FebrabanDebtNature =
    rawNature === "IPTU" ||
    rawNature === "ISS" ||
    rawNature === "DIVIDA_ATIVA" ||
    rawNature === "PARCELAMENTO"
      ? rawNature
      : "ALL";

  const page = Math.max(1, Number(resolved.page ?? 1) || 1);
  const state = await loadFebrabanStateFromDb();

  return (
    <ArrecadacaoOnlineClient
      pathname="/tributacao/arrecadacao"
      initialDebts={state.debts}
      initialLogs={state.auditLogs}
      activeView={activeView}
      activeNature={activeNature}
      page={page}
    />
  );
}

