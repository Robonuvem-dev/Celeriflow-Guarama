import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { onlineItbiPolicySchema } from "@/lib/tributacao/itbi-online";
import OnlineItbiConfigurationClient from "./OnlineItbiConfigurationClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalSubjectOptions, listFiscalActiveUsers } from "@/db/repositories/taxation-pages/lookups";
import { listPageTaxpayers, listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listPageItbiTypes } from "@/db/repositories/taxation-pages/itbi";

export const dynamic = "force-dynamic";
export default async function OnlineItbiConfigurationPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, entries, subjects, users, taxpayers, types] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { categories: ["ONLINE_ITBI_POLICY", "ITBI_NOTARY", "PROPERTY_VALUATION_RULE", "PARAMETER_SCOPE"], allowedBudgetUnitIds: allowed }),
    listFiscalSubjectOptions(database),
    listFiscalActiveUsers(database),
    listPageTaxpayers(database, { active: true }),
    listPageItbiTypes(database),
  ]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(`${row.category}:${row.entityId}:${row.title}`)) latest.set(`${row.category}:${row.entityId}:${row.title}`, row);
  // Policy and notary titles can change; their logical identity is entityId.
  const policies = new Map<string, typeof entries[number]>(); const notaries = new Map<string, typeof entries[number]>();
  for (const row of entries) { if (row.category === "ONLINE_ITBI_POLICY" && !policies.has(row.entityId)) policies.set(row.entityId, row); if (row.category === "ITBI_NOTARY" && !notaries.has(row.entityId)) notaries.set(row.entityId, row); }
  return <OnlineItbiConfigurationClient units={units.map(row => ({ id: row.budgetUnitId, entityId: row.governmentEntityId, label: `${row.governmentEntity.name} · ${row.budgetUnit.code}` }))} subjects={subjects.map(row => ({ id: row.id, processTypeId: row.processTypeId, label: `${row.processType.name} · ${row.name}` }))} users={users.map(row => ({ id: row.id, label: `${row.nome} · ${row.email}` }))} taxpayers={taxpayers.map(row => ({ id: row.id, label: row.company?.corporateName ?? row.person?.fullName ?? row.id }))} policies={[...policies.values()].map(row => ({ version: row.version, data: onlineItbiPolicySchema.parse(row.data) }))} notaries={[...notaries.values()].map(row => { const data = taxScopeSnapshot(row.data); return { id: row.entityId, version: row.version, budgetUnitId: String(data.budgetUnitId), taxpayerId: String(data.taxpayerId), name: String(data.name), active: data.active === true, usuarioIds: Array.isArray(data.usuarioIds) ? data.usuarioIds.filter((id): id is string => typeof id === "string") : [] }; })} types={types.flatMap(row => { const origin = entries.find(entry => entry.entityType === "ITBI_TRANSACTION_TYPE" && entry.entityId === row.id && entry.category === "PARAMETER_SCOPE"); return origin ? [{ ...row, budgetUnitId: String(taxScopeSnapshot(origin.data).budgetUnitId) }] : []; })} rules={[...latest.values()].filter(row => row.category === "PROPERTY_VALUATION_RULE" && taxScopeSnapshot(row.data).year === new Date().getUTCFullYear()).map(row => ({ id: row.id, label: `${row.title} · v${row.version}`, budgetUnitId: String(taxScopeSnapshot(row.data).budgetUnitId) }))}/>;
}
