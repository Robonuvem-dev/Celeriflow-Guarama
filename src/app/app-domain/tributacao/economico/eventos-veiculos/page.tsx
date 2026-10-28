import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicEventTypeSchema, economicEventSchema, economicVehicleSchema } from "@/lib/tributacao/economic-events";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import EconomicEventsVehiclesClient from "./EconomicEventsVehiclesClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalRegistrations } from "@/db/repositories/taxation-pages/lookups";
import { listPageTaxpayers, listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function EconomicEventsVehiclesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries, profiles, taxpayers] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { categories: ["ECONOMIC_EVENT_TYPE", "ECONOMIC_EVENT", "ECONOMIC_VEHICLE"], allowedBudgetUnitIds: allowed }),
    listFiscalEntries(database, { entityType: "ECONOMIC_REGISTRATION", categories: ["ECONOMIC_PROFILE"], allowedBudgetUnitIds: allowed }),
    listPageTaxpayers(database, { active: true }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(`${row.category}:${row.entityId}`)) latest.set(`${row.category}:${row.entityId}`, row);
  const latestProfiles = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId, row);
  const registrations = await listFiscalRegistrations(database, { ids: [...latestProfiles.keys()], active: true });
  return <EconomicEventsVehiclesClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} taxpayers={taxpayers.map(row => ({ id: row.id, label: row.company?.corporateName ?? row.person?.fullName ?? row.id, type: row.taxpayerType }))} registrations={registrations.map(row => ({ id: row.id, label: row.municipalInsc ?? row.id, budgetUnitId: String(taxScopeSnapshot(latestProfiles.get(row.id)?.data).budgetUnitId) }))} types={[...latest.values()].filter(row => row.category === "ECONOMIC_EVENT_TYPE").map(row => ({ id: row.entityId, version: row.version, data: economicEventTypeSchema.parse(row.data) }))} events={[...latest.values()].filter(row => row.category === "ECONOMIC_EVENT").map(row => ({ id: row.entityId, version: row.version, data: economicEventSchema.parse(row.data) }))} vehicles={[...latest.values()].filter(row => row.category === "ECONOMIC_VEHICLE").map(row => ({ id: row.entityId, version: row.version, data: economicVehicleSchema.parse(row.data) }))}/>;
}
