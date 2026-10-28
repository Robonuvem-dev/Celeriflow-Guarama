import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiExpiryPolicySchema } from "@/lib/tributacao/itbi-expiry";
import ItbiExpiryClient from "./ItbiExpiryClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function ItbiExpiryPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await listFiscalPlanningUnits(database, allowed);
  const entries = await listFiscalEntries(database, { entityType: "BUDGET_UNIT", entityIds: units.map(row => row.budgetUnitId), categories: ["ITBI_EXPIRY_POLICY"] });
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return <ItbiExpiryClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} policies={[...latest.values()].map(row => ({ version: row.version, data: itbiExpiryPolicySchema.parse(row.data) }))}/>;
}
