import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyRegistrationPolicyClient from "./PropertyRegistrationPolicyClient";

export const dynamic = "force-dynamic";
export default async function PropertyRegistrationPolicyPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  if (!isSystemAdministrator(user)) return <p className="p-4">Configuração reservada ao supervisor administrativo.</p>;
  const [units, entries] = await Promise.all([
    prisma.planningEntityUnit.findMany({ include: { budgetUnit: true, governmentEntity: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", category: "PROPERTY_REGISTRATION_POLICY" }, orderBy: { version: "desc" } }),
  ]);
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return <PropertyRegistrationPolicyClient units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} policies={[...latest.values()].map(entry => ({ version: entry.version, data: propertyRegistrationPolicySchema.parse(entry.data) }))}/>;
}
