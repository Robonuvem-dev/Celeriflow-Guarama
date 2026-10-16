import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicEventTypeSchema, economicEventSchema, economicVehicleSchema } from "@/lib/tributacao/economic-events";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import EconomicEventsVehiclesClient from "./EconomicEventsVehiclesClient";

export const dynamic = "force-dynamic";
export default async function EconomicEventsVehiclesPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const scope = allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {};
  const [units, entries, profiles, taxpayers] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxRegistryEntry.findMany({ where: { category: { in: ["ECONOMIC_EVENT_TYPE", "ECONOMIC_EVENT", "ECONOMIC_VEHICLE"] }, ...scope }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_REGISTRATION", category: "ECONOMIC_PROFILE", ...scope }, orderBy: { version: "desc" } }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, select: { id: true, taxpayerType: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(`${row.category}:${row.entityId}`)) latest.set(`${row.category}:${row.entityId}`, row);
  const latestProfiles = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId, row);
  const registrations = await prisma.economicRegistration.findMany({ where: { id: { in: [...latestProfiles.keys()] }, status: "Ativo" }, select: { id: true, municipalInsc: true } });
  return <EconomicEventsVehiclesClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} taxpayers={taxpayers.map(row => ({ id: row.id, label: row.company?.corporateName ?? row.person?.fullName ?? row.id, type: row.taxpayerType }))} registrations={registrations.map(row => ({ id: row.id, label: row.municipalInsc ?? row.id, budgetUnitId: String(taxScopeSnapshot(latestProfiles.get(row.id)?.data).budgetUnitId) }))} types={[...latest.values()].filter(row => row.category === "ECONOMIC_EVENT_TYPE").map(row => ({ id: row.entityId, version: row.version, data: economicEventTypeSchema.parse(row.data) }))} events={[...latest.values()].filter(row => row.category === "ECONOMIC_EVENT").map(row => ({ id: row.entityId, version: row.version, data: economicEventSchema.parse(row.data) }))} vehicles={[...latest.values()].filter(row => row.category === "ECONOMIC_VEHICLE").map(row => ({ id: row.entityId, version: row.version, data: economicVehicleSchema.parse(row.data) }))}/>;
}
