import type { DatabaseExecutor } from "@/db/transaction";
import type { FinancialReportScope, ResolvedFinancialReportScope } from "@/lib/contracts/finance-scope";
import { countFinancialEntityUnits, findFinancialScopeUnits, findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";

type Scope = FinancialReportScope;

/** Intersects the requested scope with the year and the caller's authorized units. */
export async function resolveFinancialReportScope(db: DatabaseExecutor, financialYearId: string, scope: Scope = {}): Promise<ResolvedFinancialReportScope> {
  const year = await findFinancialScopeYear(db, financialYearId);
  if (!year) throw new Error("Exercício financeiro não encontrado.");
  if (year.governmentEntityId && scope.governmentEntityId && year.governmentEntityId !== scope.governmentEntityId) throw new Error("A entidade solicitada diverge do exercício financeiro.");
  if (!year.governmentEntityId && scope.governmentEntityId) throw new Error("Exercício legado sem entidade conciliada; não pode representar o exercício de um ente.");
  const governmentEntityId = year.governmentEntityId ?? scope.governmentEntityId;
  const constrained = Boolean(governmentEntityId || scope.budgetUnitId || scope.budgetUnitIds);
  if (!constrained) return { ...scope, year: year.year, fullEntity: true };
  const units = await findFinancialScopeUnits(db, { ...scope, governmentEntityId });
  const allUnits = governmentEntityId ? await countFinancialEntityUnits(db, governmentEntityId) : null;
  return { ...scope, governmentEntityId: governmentEntityId ?? undefined, budgetUnitIds: units.map((unit) => unit.id), year: year.year, fullEntity: allUnits !== null && allUnits > 0 && allUnits === units.length };
}

