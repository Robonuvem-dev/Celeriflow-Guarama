import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { personnelFiscalComposition, readPersonnelFiscalPosition } from "@/lib/financeiro/personnel-fiscal";
import { PersonnelFiscalClient } from "./PersonnelFiscalClient";

export default async function PersonnelFiscalPage({ searchParams }: { searchParams: Promise<{ yearId?: string; through?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("FINANCEIRO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const all = await prisma.financialYear.findMany({ where: { governmentEntityId: { not: null } }, include: { governmentEntity: { include: { planningUnits: { include: { budgetUnit: { select: { id: true, name: true } } } } } } }, orderBy: [{ year: "desc" }, { id: "asc" }] });
  const years = all.filter(year => year.governmentEntity!.planningUnits.length && (!allowed || year.governmentEntity!.planningUnits.every(unit => allowed.includes(unit.budgetUnitId))));
  const query = await searchParams;
  const selected = years.find(year => year.id === query.yearId) ?? years[0];
  if (!selected) return <p className="p-5">Apuração exige acesso a todas as UGs do ente.</p>;
  const now = new Date();
  const fallback = selected.year === now.getUTCFullYear() ? (now.getUTCMonth() ? new Date(Date.UTC(selected.year, now.getUTCMonth(), 0)).toISOString().slice(0, 10) : now.toISOString().slice(0, 10)) : `${selected.year}-12-31`;
  const date = z.iso.date().safeParse(query.through ?? fallback);
  if (!date.success || !date.data.startsWith(`${selected.year}-`) || date.data > now.toISOString().slice(0, 10)) return <p className="p-5">Selecione corte válido/passado no exercício.</p>;
  const [position, accounts, sources, revisions] = await Promise.all([
    readPersonnelFiscalPosition(prisma, { financialYearId: selected.id, through: new Date(`${date.data}T23:59:59.999Z`), budgetUnitIds: allowed }),
    prisma.accountingPlan.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.accountingTransaction.groupBy({ by: ["sourceType"], where: { governmentEntityId: selected.governmentEntityId!, budgetUnitId: { in: selected.governmentEntity!.planningUnits.map(unit => unit.budgetUnitId) } }, orderBy: { sourceType: "asc" } }),
    prisma.municipalPersonnelFiscalDefinition.findMany({ where: { financialYearId: selected.id }, orderBy: { revision: "desc" } }),
  ]);
  return <PersonnelFiscalClient key={selected.id} yearId={selected.id} year={selected.year} through={date.data} years={years.map(year => ({ id: year.id, name: `${year.governmentEntity?.name} — ${year.year}` }))} options={{ accounts, units: selected.governmentEntity!.planningUnits.map(unit => unit.budgetUnit), sourceTypes: sources.map(source => source.sourceType) }} position={position} revisions={revisions.map(row => ({ id: row.id, revision: row.revision, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10), legalReference: row.legalReference, legalLimit: row.legalLimit.toFixed(4), prudentialLimit: row.prudentialLimit.toFixed(4), alertLimit: row.alertLimit.toFixed(4), definition: personnelFiscalComposition.parse(row.definition) }))} />;
}
