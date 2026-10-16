import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiExpiryPolicySchema } from "@/lib/tributacao/itbi-expiry";
import ItbiExpiryClient from "./ItbiExpiryClient";

export const dynamic = "force-dynamic";
export default async function ItbiExpiryPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } });
  const entries = await prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", entityId: { in: units.map(row => row.budgetUnitId) }, category: "ITBI_EXPIRY_POLICY" }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return <ItbiExpiryClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} policies={[...latest.values()].map(row => ({ version: row.version, data: itbiExpiryPolicySchema.parse(row.data) }))}/>;
}
