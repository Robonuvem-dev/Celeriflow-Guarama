import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyRegistrationPolicyClient from "./PropertyRegistrationPolicyClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function PropertyRegistrationPolicyPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { user } = context; const database = context.database ?? db;
  if (!isSystemAdministrator(user)) return <p className="p-4">Configuração reservada ao supervisor administrativo.</p>;
  const [units, entries] = await Promise.all([
    listFiscalPlanningUnits(database),
    listFiscalEntries(database, { entityType: "BUDGET_UNIT", categories: ["PROPERTY_REGISTRATION_POLICY"] }),
  ]);
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return <PropertyRegistrationPolicyClient units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} policies={[...latest.values()].map(entry => ({ version: entry.version, data: propertyRegistrationPolicySchema.parse(entry.data) }))}/>;
}
