import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import PropertyBulkClient from "./PropertyBulkClient";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";

export const dynamic = "force-dynamic";
export default async function PropertyBulkPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, streets, neighborhoods, entries, policies] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.street.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.neighborhood.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", category: "PROPERTY_REGISTRATION_POLICY", ...(allowed ? { entityId: { in: allowed } } : {}) }, orderBy: { version: "desc" } }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  const activeCatalogs = [...latest.values()].map(row => ({ id: row.entityId, version: row.version, data: fiscalCatalogSchema.parse(row.data) })).filter(row => row.data.active);
  const catalogs = activeCatalogs.filter(row => ["BCI_TERRENO", "BCI_UNIDADE", "BCI_RURAL"].includes(row.data.kind));
  const latestPolicies = new Map<string, typeof policies[number]>(); for (const row of policies) if (!latestPolicies.has(row.entityId)) latestPolicies.set(row.entityId, row);
  return <PropertyBulkClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} streets={streets.map(row => ({ id: row.id, label: row.name }))} neighborhoods={neighborhoods.map(row => ({ id: row.id, label: row.name }))} catalogs={catalogs} statuses={activeCatalogs.filter(row => row.data.kind === "SITUACAO_IMOVEL").map(row => ({ budgetUnitId: row.data.budgetUnitId, name: row.data.name }))} policies={[...latestPolicies.values()].map(row => { const policy = propertyRegistrationPolicySchema.parse(row.data); return { budgetUnitId: row.entityId, segments: policy.segments }; })}/>;
}
