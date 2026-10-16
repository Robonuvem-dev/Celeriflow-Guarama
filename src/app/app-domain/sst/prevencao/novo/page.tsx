import Link from "next/link";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { Prisma } from "@prisma/client";
import { sstUnitWhere } from "@/lib/sst/access";
import { preventionKind, preventionKinds } from "@/lib/sst/prevention-policy";
import { PreventionForm, type References } from "../PreventionForm";
export const dynamic = "force-dynamic";
export default async function NewPreventionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModuleOperation("SST", "create"), search = await searchParams;
  const kind = preventionKind.catch("CIPA").parse(search.kind);
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), orderBy: { name: "asc" } });
  const budgetUnitId = typeof search.budgetUnitId === "string" ? search.budgetUnitId : units[0]?.id;
  if (!budgetUnitId) return <main className="p-4">Nenhuma UG autorizada.</main>;
  assertBudgetUnitAccess(context.user, budgetUnitId);
  const unit = units.find(u => u.id === budgetUnitId);
  if (!unit) return <main className="p-4">Unidade gestora inexistente.</main>;
  const [people, employees, suppliers, assets, records, professionals] = await Promise.all([
    context.prisma.person.findMany({ where: { status: "Ativo" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
    context.prisma.employee.findMany({ where: { isActive: true, secretariatId: unit.secretariatId, personId: { not: null } }, include: { person: { select: { fullName: true } } }, orderBy: { name: "asc" }, take: 500 }),
    context.prisma.supplier.findMany({ where: { status: "Ativo" }, include: { person: { select: { fullName: true } }, company: { select: { corporateName: true } } }, take: 500 }),
    context.prisma.asset.findMany({ where: { department: { secretariatId: unit.secretariatId } }, select: { id: true, name: true, patrimonyNumber: true }, take: 500 }),
    context.prisma.$queryRaw<{ id: string; title: string; kind: string }[]>`SELECT "id","title","kind" FROM "SstPreventionRecord" WHERE "budgetUnitId"=${budgetUnitId} AND "kind" IN ('CIPA','PCA','EXTINGUISHER') ORDER BY "createdAt" DESC,"id" LIMIT 500`,
    context.prisma.$queryRaw<{ id: string; label: string }[]>(Prisma.sql`SELECT r."id",p."fullName" || ' — ' || r."council" AS label FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${budgetUnitId} AND r."usuarioId"=${context.user.id} AND r."discipline"='MEDICINE' AND r."isActive"=true ORDER BY p."fullName" LIMIT 100`),
  ]);
  const refs: References = { person: people.map(p => ({ id: p.id, label: p.fullName })), employee: employees.map(e => ({ id: e.id, label: `${e.person?.fullName || e.name} — ${e.registration || e.id}` })), supplier: suppliers.map(s => ({ id: s.id, label: s.company?.corporateName || s.person?.fullName || s.id })), asset: assets.map(a => ({ id: a.id, label: `${a.patrimonyNumber} — ${a.name}` })), professional: professionals };
  for (const key of ["CIPA", "PCA", "EXTINGUISHER"]) refs[key] = records.filter(r => r.kind === key).map(r => ({ id: r.id, label: r.title }));
  return <main className="space-y-4 p-4"><Link href="/sst/prevencao" className="underline">CIPA e prevenção</Link><h1 className="text-xl font-semibold">Novo registro de prevenção</h1><form method="get" className="flex flex-wrap gap-3"><label>UG<select className="ml-2 rounded border p-2" name="budgetUnitId" defaultValue={budgetUnitId}>{units.map(u => <option value={u.id} key={u.id}>{u.code} — {u.name}</option>)}</select></label><label>Rotina<select className="ml-2 rounded border p-2" name="kind" defaultValue={kind}>{Object.entries(preventionKinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button className="rounded border px-3">Abrir cadastro</button></form><PreventionForm key={`${budgetUnitId}:${kind}`} budgetUnitId={budgetUnitId} kind={kind} refs={refs} /></main>;
}
