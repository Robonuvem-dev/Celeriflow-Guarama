import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { FiscalIndicesClient } from "./FiscalIndicesClient";
import { readMunicipalFiscalIndex, fiscalIndexDefinitionSchema } from "@/lib/financeiro/fiscal-indices";

export default async function FiscalIndicesPage({ searchParams }: { searchParams: Promise<{ yearId?: string; through?: string }> }) {
  const context = await getTenantContextForModule("FINANCEIRO");
  const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const all = await context.prisma.financialYear.findMany({ where: { governmentEntityId: { not: null } }, include: { governmentEntity: { select: { name: true, planningUnits: { include: { budgetUnit: { select: { id: true, name: true } } } } } } }, orderBy: [{ year: "desc" }, { id: "asc" }] });
  const years = all.filter(year => year.governmentEntity!.planningUnits.length && (!actor.allowedBudgetUnitIds || year.governmentEntity!.planningUnits.every(unit => actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))));
  const query = await searchParams; const selected = years.find(year => year.id === query.yearId) ?? years[0];
  if (!selected) return <p className="p-5">A leitura de índices exige autorização de todas as UGs do ente.</p>;
  const fallback = selected.year === new Date().getUTCFullYear() ? new Date(Date.UTC(selected.year, new Date().getUTCMonth(), 0)).toISOString().slice(0, 10) : `${selected.year}-12-31`;
  const parsed = z.iso.date().safeParse(query.through ?? fallback);
  if (!parsed.success) return <p className="p-5">Corte fiscal inválido.</p>;
  const through = new Date(`${parsed.data}T23:59:59.999Z`);
  if (through.getUTCFullYear() !== selected.year || through > new Date()) return <p className="p-5">Selecione corte passado no exercício do ente.</p>;
  const [indices, accounts, revisions] = await Promise.all([
    context.prisma.$transaction(async tx => Promise.all((["HEALTH_MINIMUM", "EDUCATION_MINIMUM"] as const).map(code => readMunicipalFiscalIndex(tx, actor, { financialYearId: selected.id, code, through }))), { isolationLevel: "RepeatableRead", timeout: 60000 }),
    context.prisma.accountingPlan.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    context.prisma.municipalFiscalIndexDefinition.findMany({ where: { financialYearId: selected.id }, orderBy: [{ code: "asc" }, { revision: "desc" }] }),
  ]);
  return <FiscalIndicesClient yearId={selected.id} years={years.map(year => ({ id: year.id, name: `${year.governmentEntity?.name} — ${year.year}` }))} units={selected.governmentEntity!.planningUnits.map(unit => unit.budgetUnit)} accounts={accounts} through={parsed.data} indices={indices} revisions={revisions.map(row => ({ id: row.id, code: row.code, revision: row.revision, legalReference: row.legalReference, minimumPercentage: row.minimumPercentage.toFixed(4), effectiveFrom: row.effectiveFrom.toISOString(), definition: fiscalIndexDefinitionSchema.parse(row.definition) }))} />;
}
