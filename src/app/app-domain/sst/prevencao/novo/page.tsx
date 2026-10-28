import Link from "next/link";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { readSstPreventionOptions } from "@/db/repositories/sst-pages/prevention";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { preventionKind, preventionKinds } from "@/lib/sst/prevention-policy";
import { PreventionForm, type References } from "../PreventionForm";
export const dynamic = "force-dynamic";
export default async function NewPreventionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModuleOperation("SST", "create"), search = await searchParams;
  const kind = preventionKind.catch("CIPA").parse(search.kind);
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const budgetUnitId = typeof search.budgetUnitId === "string" ? search.budgetUnitId : units[0]?.id;
  if (!budgetUnitId) return <main className="p-4">Nenhuma UG autorizada.</main>;
  assertBudgetUnitAccess(context.user, budgetUnitId);
  const unit = units.find(u => u.id === budgetUnitId);
  if (!unit) return <main className="p-4">Unidade gestora inexistente.</main>;
  const {people,employees,suppliers,assets,records,professionals}=await readSstPreventionOptions(database,unit,context.user.id);
  const refs: References = { person: people.map(p => ({ id: p.id, label: p.fullName })), employee: employees.map(e => ({ id: e.id, label: `${e.person?.fullName || e.name} — ${e.registration || e.id}` })), supplier: suppliers.map(s => ({ id: s.id, label: s.company?.corporateName || s.person?.fullName || s.id })), asset: assets.map(a => ({ id: a.id, label: `${a.patrimonyNumber} — ${a.name}` })), professional: professionals };
  for (const key of ["CIPA", "PCA", "EXTINGUISHER"]) refs[key] = records.filter(r => r.kind === key).map(r => ({ id: r.id, label: r.title }));
  return <main className="space-y-4 p-4"><Link href="/sst/prevencao" className="underline">CIPA e prevenção</Link><h1 className="text-xl font-semibold">Novo registro de prevenção</h1><form method="get" className="flex flex-wrap gap-3"><label>UG<select className="ml-2 rounded border p-2" name="budgetUnitId" defaultValue={budgetUnitId}>{units.map(u => <option value={u.id} key={u.id}>{u.code} — {u.name}</option>)}</select></label><label>Rotina<select className="ml-2 rounded border p-2" name="kind" defaultValue={kind}>{Object.entries(preventionKinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button className="rounded border px-3">Abrir cadastro</button></form><PreventionForm key={`${budgetUnitId}:${kind}`} budgetUnitId={budgetUnitId} kind={kind} refs={refs} /></main>;
}
