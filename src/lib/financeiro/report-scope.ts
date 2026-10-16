import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Scope = { governmentEntityId?: string; budgetUnitId?: string; budgetUnitIds?: string[] };

/** Intersects the requested scope with the year and the caller's authorized units. */
export async function resolveFinancialReportScope(db: Db, financialYearId: string, scope: Scope = {}) {
  const year = await db.financialYear.findUnique({ where: { id: financialYearId }, select: { year: true, governmentEntityId: true } });
  if (!year) throw new Error("Exercício financeiro não encontrado.");
  if (year.governmentEntityId && scope.governmentEntityId && year.governmentEntityId !== scope.governmentEntityId) throw new Error("A entidade solicitada diverge do exercício financeiro.");
  if (!year.governmentEntityId && scope.governmentEntityId) throw new Error("Exercício legado sem entidade conciliada; não pode representar o exercício de um ente.");
  const governmentEntityId = year.governmentEntityId ?? scope.governmentEntityId;
  const constrained = Boolean(governmentEntityId || scope.budgetUnitId || scope.budgetUnitIds);
  if (!constrained) return { ...scope, year: year.year, fullEntity: true };
  const units = await db.budgetUnit.findMany({
    where: {
      ...(governmentEntityId ? { planningEntityUnit: { is: { governmentEntityId } } } : {}),
      ...(scope.budgetUnitId ? { id: scope.budgetUnitId } : {}),
      ...(scope.budgetUnitIds ? { AND: [{ id: { in: scope.budgetUnitIds } }] } : {}),
    }, select: { id: true },
  });
  const allUnits = governmentEntityId ? await db.planningEntityUnit.count({ where: { governmentEntityId } }) : null;
  return { ...scope, governmentEntityId: governmentEntityId ?? undefined, budgetUnitIds: units.map((unit) => unit.id), year: year.year, fullEntity: allUnits !== null && allUnits > 0 && allUnits === units.length };
}

export function financialUnitFilter(scope: Scope): Prisma.BankAccountWhereInput {
  return {
    ...(scope.governmentEntityId ? { budgetUnit: { is: { planningEntityUnit: { is: { governmentEntityId: scope.governmentEntityId } } } } } : {}),
    ...(scope.budgetUnitId ? { budgetUnitId: scope.budgetUnitId } : {}),
    ...(scope.budgetUnitIds ? { AND: [{ budgetUnitId: { in: scope.budgetUnitIds } }] } : {}),
  };
}
