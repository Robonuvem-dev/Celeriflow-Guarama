import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiEntryPolicySchema } from "@/lib/tributacao/itbi-entry-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ItbiEntryPolicyClient from "./ItbiEntryPolicyClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listPageItbiTypes } from "@/db/repositories/taxation-pages/itbi";

export const dynamic = "force-dynamic";
export default async function ItbiEntryPolicyPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries, types, origins] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { entityType: "BUDGET_UNIT", categories: ["ITBI_ENTRY_POLICY"], entityIds: allowed }),
    listPageItbiTypes(database),
    listFiscalEntries(database, { entityType: "ITBI_TRANSACTION_TYPE", categories: ["PARAMETER_SCOPE"], order: "none" }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return <ItbiEntryPolicyClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} policies={[...latest.values()].map(row => ({ unitId: row.entityId, version: row.version, data: itbiEntryPolicySchema.parse(row.data) }))} types={types.flatMap(row => { const origin = taxScopeSnapshot(origins.find(entry => entry.entityId === row.id)?.data); return units.some(unit => unit.budgetUnitId === origin.budgetUnitId && unit.governmentEntityId === origin.governmentEntityId) ? [{ id: row.id, label: row.name, unitId: String(origin.budgetUnitId) }] : []; })}/>;
}
