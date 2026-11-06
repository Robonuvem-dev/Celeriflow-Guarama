import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import CadastroTecnicoBicClient from "./CadastroTecnicoBicClient";

export const dynamic = "force-dynamic";

export default async function CadastroTecnicoBicPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { user } = context;
  const database = context.database ?? db;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;

  const [units, catalogs] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { categories: ["TYPED_FISCAL_CATALOG"], allowedBudgetUnitIds: allowed }),
  ]);

  const latest = new Map<string, (typeof catalogs)[number]>();
  for (const catalog of catalogs) {
    if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  }

  const parsedCatalogs = [...latest.values()].map((entry) => ({
    id: entry.entityId,
    version: entry.version,
    data: fiscalCatalogSchema.parse(entry.data),
  }));

  return (
    <CadastroTecnicoBicClient
      units={units.map((unit) => ({
        id: unit.budgetUnitId,
        entityId: unit.governmentEntityId,
        label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code} · ${unit.budgetUnit.name}`,
      }))}
      catalogs={parsedCatalogs}
    />
  );
}
