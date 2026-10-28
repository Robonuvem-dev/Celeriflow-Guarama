import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import DebtNoticesClient from "./DebtNoticesClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalStreets, listFiscalNeighborhoods, listFiscalTaxLabels } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function DebtNoticesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, streets, neighborhoods, taxes, notices, cancellations] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalStreets(database), listFiscalNeighborhoods(database), listFiscalTaxLabels(database),
    listFiscalEntries(database, { entityType: "DEBT_NOTICE", categories: ["DEBT_NOTICE_ISSUANCE"], allowedBudgetUnitIds: allowed, order: "created" }),
    listFiscalEntries(database, { entityType: "DEBT_NOTICE", categories: ["DEBT_NOTICE_CANCELLATION"], allowedBudgetUnitIds: allowed, order: "none" }),
  ]);
  const cancelled = new Set(cancellations.map(row => row.entityId));
  return <DebtNoticesClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} streets={streets.map(row => ({ id: row.id, label: row.name }))} neighborhoods={neighborhoods.map(row => ({ id: row.id, label: row.name }))} taxes={taxes.map(row => ({ id: row.id, label: row.name }))} notices={notices.map(row => { const data = taxScopeSnapshot(row.data); const target = taxScopeSnapshot(data.target); return { id: row.entityId, batchId: String(data.batchId), budgetUnitId: String(data.budgetUnitId), title: row.title, type: String(data.type), issuedAt: row.createdAt.toISOString().slice(0, 10), taxpayer: String(target.taxpayer), taxpayerId: String(target.taxpayerId), propertyId: typeof target.propertyId === "string" ? target.propertyId : "", inscription: String(target.inscription), balance: String(target.balance), cancelled: cancelled.has(row.entityId) }; })}/>;
}
