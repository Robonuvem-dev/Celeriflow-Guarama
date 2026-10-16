import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import DebtNoticesClient from "./DebtNoticesClient";

export const dynamic = "force-dynamic";
export default async function DebtNoticesPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, streets, neighborhoods, taxes, notices, cancellations] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.street.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }), prisma.neighborhood.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }), prisma.tax.findMany({ select: { id: true, name: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "DEBT_NOTICE", category: "DEBT_NOTICE_ISSUANCE", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { createdAt: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "DEBT_NOTICE", category: "DEBT_NOTICE_CANCELLATION", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, select: { entityId: true } }),
  ]);
  const cancelled = new Set(cancellations.map(row => row.entityId));
  return <DebtNoticesClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} streets={streets.map(row => ({ id: row.id, label: row.name }))} neighborhoods={neighborhoods.map(row => ({ id: row.id, label: row.name }))} taxes={taxes.map(row => ({ id: row.id, label: row.name }))} notices={notices.map(row => { const data = taxScopeSnapshot(row.data); const target = taxScopeSnapshot(data.target); return { id: row.entityId, batchId: String(data.batchId), budgetUnitId: String(data.budgetUnitId), title: row.title, type: String(data.type), issuedAt: row.createdAt.toISOString().slice(0, 10), taxpayer: String(target.taxpayer), taxpayerId: String(target.taxpayerId), propertyId: typeof target.propertyId === "string" ? target.propertyId : "", inscription: String(target.inscription), balance: String(target.balance), cancelled: cancelled.has(row.entityId) }; })}/>;
}
