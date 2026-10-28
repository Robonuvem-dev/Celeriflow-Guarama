import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { FiscalIndicesClient } from "./FiscalIndicesClient";
import { readMunicipalFiscalIndex, fiscalIndexDefinitionSchema } from "@/lib/financeiro/fiscal-indices";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { listFiscalAccounts, listFiscalEntityYears, listFiscalRevisions } from "@/db/repositories/finance/fiscal-indices";

export default async function FiscalIndicesPage({ searchParams }: { searchParams: Promise<{ yearId?: string; through?: string }> }) {
  const context = await getTenantContextForModule("FINANCEIRO");
  const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const executor = context.database ?? db;
  const all = await listFiscalEntityYears(executor);
  const years = all.filter(year => year.governmentEntity!.planningUnits.length && (!actor.allowedBudgetUnitIds || year.governmentEntity!.planningUnits.every(unit => actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))));
  const query = await searchParams; const selected = years.find(year => year.id === query.yearId) ?? years[0];
  if (!selected) return <p className="p-5">A leitura de índices exige autorização de todas as UGs do ente.</p>;
  const fallback = selected.year === new Date().getUTCFullYear() ? new Date(Date.UTC(selected.year, new Date().getUTCMonth(), 0)).toISOString().slice(0, 10) : `${selected.year}-12-31`;
  const parsed = z.iso.date().safeParse(query.through ?? fallback);
  if (!parsed.success) return <p className="p-5">Corte fiscal inválido.</p>;
  const through = new Date(`${parsed.data}T23:59:59.999Z`);
  if (through.getUTCFullYear() !== selected.year || through > new Date()) return <p className="p-5">Selecione corte passado no exercício do ente.</p>;
  const [indices, accounts, revisions] = await Promise.all([
    withDatabaseTransaction(databaseConnection, async tx => Promise.all((["HEALTH_MINIMUM", "EDUCATION_MINIMUM"] as const).map(code => readMunicipalFiscalIndex(tx, actor, { financialYearId: selected.id, code, through }))), { isolationLevel: "repeatable read", timeoutMs: 60000 }),
    listFiscalAccounts(executor),
    listFiscalRevisions(executor, selected.id),
  ]);
  return <FiscalIndicesClient yearId={selected.id} years={years.map(year => ({ id: year.id, name: `${year.governmentEntity?.name} — ${year.year}` }))} units={selected.governmentEntity!.planningUnits.map(unit => unit.budgetUnit)} accounts={accounts} through={parsed.data} indices={indices} revisions={revisions.map(row => ({ id: row.id, code: row.code, revision: row.revision, legalReference: row.legalReference, minimumPercentage: row.minimumPercentage.toFixed(4), effectiveFrom: row.effectiveFrom.toISOString(), definition: fiscalIndexDefinitionSchema.parse(row.definition) }))} />;
}
