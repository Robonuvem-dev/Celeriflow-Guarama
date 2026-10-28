import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { itbiDocumentModelSchema } from "@/lib/tributacao/itbi-document-models";
import ItbiDocumentModelsClient from "./ItbiDocumentModelsClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function ItbiDocumentModelsPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { entityType: "ITBI_DOCUMENT_MODEL", categories: ["ITBI_DOCUMENT_MODEL"], allowedBudgetUnitIds: allowed }),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return <ItbiDocumentModelsClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} models={[...latest.values()].map(row => ({ id: row.entityId, version: row.version, data: itbiDocumentModelSchema.parse(row.data) }))}/>;
}
