import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiDocumentModelSchema } from "@/lib/tributacao/itbi-document-models";
import ItbiDocumentModelsClient from "./ItbiDocumentModelsClient";

export const dynamic = "force-dynamic";
export default async function ItbiDocumentModelsPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DOCUMENT_MODEL", category: "ITBI_DOCUMENT_MODEL", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { version: "desc" } }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return <ItbiDocumentModelsClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} models={[...latest.values()].map(row => ({ id: row.entityId, version: row.version, data: itbiDocumentModelSchema.parse(row.data) }))}/>;
}
