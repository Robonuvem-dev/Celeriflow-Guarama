import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listFiscalProperties, listFiscalPlanningUnits, listFiscalProcessOptions, listFiscalStreets, listFiscalNeighborhoods } from "@/db/repositories/taxation-pages/lookups";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import PropertyOperationsClient from "./PropertyOperationsClient";

export const dynamic = "force-dynamic";

export default async function PropertyOperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const params = await searchParams;
  const filter = Object.fromEntries(Object.entries(params).filter(([key, value]) => ["query", "streetId", "neighborhoodId", "status", "propertyUse"].includes(key) && typeof value === "string" && value !== "")) as Record<string, string>;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [rows, units, processes, taxpayers, streets, neighborhoods] = await Promise.all([
    listFiscalProperties(database, { filter, order: true, limit: 1001 }),
    listFiscalPlanningUnits(database, allowed),
    listFiscalProcessOptions(database),
    listPageTaxpayers(database, { limit: 1000 }),
    listFiscalStreets(database),
    listFiscalNeighborhoods(database),
  ]);
  return <PropertyOperationsClient rows={rows.map(row => ({ id: row.id, inscription: row.municipalInsc ?? row.id, updatedAt: row.updatedAt.toISOString(), landArea: row.landArea, builtArea: row.builtArea, status: row.status }))} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} filter={filter} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} streets={streets.map(item => ({ id: item.id, label: item.name }))} neighborhoods={neighborhoods.map(item => ({ id: item.id, label: item.name }))} />;
}
