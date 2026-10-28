import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { simplesOptionLayoutSchema } from "@/lib/tributacao/simples-option-files";
import SimplesOptionFilesClient from "./SimplesOptionFilesClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function SimplesOptionFilesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { categories: ["SIMPLES_OPTION_LAYOUT", "SIMPLES_OPTION_FILE", "SIMPLES_OPTION_EXPORT", "SIMPLES_OPTION_DECISION"], allowedBudgetUnitIds: allowed, order: "version-created" }),
  ]);
  const layouts = new Map<string, typeof entries[number]>(); const decisions = new Map<string, typeof entries[number]>(); for (const row of entries) { if (row.category === "SIMPLES_OPTION_LAYOUT" && !layouts.has(row.entityId)) layouts.set(row.entityId, row); if (row.category === "SIMPLES_OPTION_DECISION" && !decisions.has(row.entityId)) decisions.set(row.entityId, row); }
  const names = await listFiscalActorNames(database, [...decisions.values()].flatMap(row => row.actorUsuarioId ? [row.actorUsuarioId] : []));
  return <SimplesOptionFilesClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} layouts={[...layouts.values()].map(row => ({ version: row.version, data: simplesOptionLayoutSchema.parse(row.data) }))} files={entries.filter(row => row.category === "SIMPLES_OPTION_FILE").map(row => { const data = taxScopeSnapshot(row.data); return { id: row.entityId, budgetUnitId: String(data.budgetUnitId), filename: String(data.filename), createdAt: row.createdAt.toISOString(), checksum: String(data.checksum), rows: Array.isArray(data.rows) ? data.rows.map(item => { const row = taxScopeSnapshot(item); return { cnpj: String(row.cnpj), name: String(row.name), balance: String(row.balance), pending: Array.isArray(row.pending) ? row.pending.map(String) : [] }; }) : [] }; })} decisions={[...decisions.values()].map(row => { const data = taxScopeSnapshot(row.data); return { id: row.id, fileId: String(data.fileId), cnpj: String(data.cnpj), version: row.version, approved: data.approved === true, reason: String(data.reason), actor: names.find(user => user.id === row.actorUsuarioId)?.nome ?? "Operador" }; })}/>;
}
