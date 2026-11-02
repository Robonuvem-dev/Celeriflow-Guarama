import { db } from "@/db/client";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { parseRecyclingEntries } from "@/lib/environment/recycling-catalog";
import { saveRecyclingEntryForClient } from "./actions";
import { CatalogView } from "./CatalogView";
import { selectRecyclingCatalogPage } from "./catalog-list";

export const dynamic = "force-dynamic";
export default async function RecyclingCatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const raw = await searchParams;
  const text = (name: string) => typeof raw[name] === "string" ? raw[name] as string : undefined;
  const instance = await findOperationalInstance(context.database ?? db);
  const entries = parseRecyclingEntries(instance?.parametros.filter(parameter => parameter.chave.startsWith("RECYCLING_CATALOG:")).map(parameter => parameter.valor) ?? []);
  const list = selectRecyclingCatalogPage(entries, { catalog: text("catalog"), q: text("q"), situacao: text("situacao"), page: text("page") });
  return <CatalogView kind={list.kind} entries={list.items} search={list.search} situation={list.situation} page={list.currentPage} total={list.total}
    available={!!instance} canCreate={canPerformModuleOperation(context.user, "MEIO_AMBIENTE", "create")} canUpdate={canPerformModuleOperation(context.user, "MEIO_AMBIENTE", "update")} saveAction={saveRecyclingEntryForClient} />;
}
