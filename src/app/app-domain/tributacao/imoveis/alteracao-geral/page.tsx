import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import PropertyBulkClient from "./PropertyBulkClient";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalStreets, listFiscalNeighborhoods } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function PropertyBulkPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, streets, neighborhoods, entries, policies] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalStreets(database),
    listFiscalNeighborhoods(database),
    listFiscalEntries(database, { entityType: "FISCAL_CATALOG", categories: ["TYPED_FISCAL_CATALOG"], allowedBudgetUnitIds: allowed }),
    listFiscalEntries(database, { entityType: "BUDGET_UNIT", categories: ["PROPERTY_REGISTRATION_POLICY"], entityIds: allowed }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  const activeCatalogs = [...latest.values()].map(row => ({ id: row.entityId, version: row.version, data: fiscalCatalogSchema.parse(row.data) })).filter(row => row.data.active);
  const catalogs = activeCatalogs.filter(row => ["BCI_TERRENO", "BCI_UNIDADE", "BCI_RURAL"].includes(row.data.kind));
  const latestPolicies = new Map<string, typeof policies[number]>(); for (const row of policies) if (!latestPolicies.has(row.entityId)) latestPolicies.set(row.entityId, row);
  return <PropertyBulkClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} streets={streets.map(row => ({ id: row.id, label: row.name }))} neighborhoods={neighborhoods.map(row => ({ id: row.id, label: row.name }))} catalogs={catalogs} statuses={activeCatalogs.filter(row => row.data.kind === "SITUACAO_IMOVEL").map(row => ({ budgetUnitId: row.data.budgetUnitId, name: row.data.name }))} policies={[...latestPolicies.values()].map(row => { const policy = propertyRegistrationPolicySchema.parse(row.data); return { budgetUnitId: row.entityId, segments: policy.segments }; })}/>;
}
