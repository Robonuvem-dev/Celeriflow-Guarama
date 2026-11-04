import { getGedContext, canUseGed } from "@/lib/documents/ged-access";
import { gedSelectors } from "@/db/repositories/documents/ged";
import { gedCapabilities } from "@/lib/documents/ged-policy";
import { getBlobDocumentPrefix } from "@/lib/platform/blob";
import { GedSourceWorkspace } from "@/components/signatures/ged/GedSourceWorkspace";
import type { GedBootstrap } from "@/lib/contracts/ged";
export const dynamic = "force-dynamic";
export default async function GedSourcesPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const context = await getGedContext(); const params = await searchParams;
  const bootstrap: GedBootstrap = { ...await gedSelectors(context), userId: context.user.id, departmentId: context.user.departmentId, documentPrefix: getBlobDocumentPrefix(), capabilities: Object.fromEntries(gedCapabilities.map(key => [key, canUseGed(context.user, key)])) as GedBootstrap["capabilities"] };
  return <GedSourceWorkspace bootstrap={bootstrap} initialModule={["PROCESSOS", "PLANEJAMENTO", "FINANCEIRO", "OBRAS", "RH"].includes(params.module ?? "") ? params.module! : "PROCESSOS"} />;
}
