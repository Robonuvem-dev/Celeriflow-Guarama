import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyFilterWhere } from "@/lib/tributacao/property-operations";
import PropertyOperationsClient from "./PropertyOperationsClient";

export const dynamic = "force-dynamic";

export default async function PropertyOperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const params = await searchParams;
  const filter = Object.fromEntries(Object.entries(params).filter(([key, value]) => ["query", "streetId", "neighborhoodId", "status", "propertyUse"].includes(key) && typeof value === "string" && value !== "")) as Record<string, string>;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [rows, units, processes, taxpayers, streets, neighborhoods] = await Promise.all([
    prisma.realEstate.findMany({ where: propertyFilterWhere(filter), orderBy: { municipalInsc: "asc" }, take: 1001 }),
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { budgetUnit: true, governmentEntity: true } }),
    prisma.process.findMany({ select: { id: true, protocolNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.taxpayer.findMany({ select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } }, take: 1000 }),
    prisma.street.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.neighborhood.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <PropertyOperationsClient rows={rows.map(row => ({ id: row.id, inscription: row.municipalInsc ?? row.id, updatedAt: row.updatedAt.toISOString(), landArea: row.landArea, builtArea: row.builtArea, status: row.status }))} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} filter={filter} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} streets={streets.map(item => ({ id: item.id, label: item.name }))} neighborhoods={neighborhoods.map(item => ({ id: item.id, label: item.name }))} />;
}
