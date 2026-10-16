import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiEntryPolicySchema } from "@/lib/tributacao/itbi-entry-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ItbiEntryPolicyClient from "./ItbiEntryPolicyClient";

export const dynamic = "force-dynamic";
export default async function ItbiEntryPolicyPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries, types, origins] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", category: "ITBI_ENTRY_POLICY", ...(allowed ? { entityId: { in: allowed } } : {}) }, orderBy: { version: "desc" } }),
    prisma.itbiTransactionType.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "ITBI_TRANSACTION_TYPE", category: "PARAMETER_SCOPE" } }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return <ItbiEntryPolicyClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} policies={[...latest.values()].map(row => ({ unitId: row.entityId, version: row.version, data: itbiEntryPolicySchema.parse(row.data) }))} types={types.flatMap(row => { const origin = taxScopeSnapshot(origins.find(entry => entry.entityId === row.id)?.data); return units.some(unit => unit.budgetUnitId === origin.budgetUnitId && unit.governmentEntityId === origin.governmentEntityId) ? [{ id: row.id, label: row.name, unitId: String(origin.budgetUnitId) }] : []; })}/>;
}
