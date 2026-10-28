import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { financialYears } from "../../schema/finance-years";
import { planningBudgetUnitLabels, planningEntityUnits } from "../../schema/planning-catalog";
import { governmentEntities } from "../../schema/master-data";
import type { FinancialReportScope, FinancialYearRecord } from "@/lib/contracts/finance-scope";

export async function findFinancialScopeYear(db: DatabaseExecutor, id: string): Promise<FinancialYearRecord | null> {
  const [year] = await db.select().from(financialYears).where(eq(financialYears.id, id));
  return year ?? null;
}

export async function findFinancialScopeUnits(db: DatabaseExecutor, scope: FinancialReportScope): Promise<{ id: string }[]> {
  return db.select({ id: planningBudgetUnitLabels.id }).from(planningBudgetUnitLabels)
    .leftJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnitLabels.id))
    .where(and(scope.governmentEntityId ? eq(planningEntityUnits.governmentEntityId, scope.governmentEntityId) : undefined,
      scope.budgetUnitId ? eq(planningBudgetUnitLabels.id, scope.budgetUnitId) : undefined,
      scope.budgetUnitIds ? inArray(planningBudgetUnitLabels.id, scope.budgetUnitIds) : undefined));
}

export async function countFinancialEntityUnits(db: DatabaseExecutor, governmentEntityId: string): Promise<number> {
  const [result] = await db.select({ total: count() }).from(planningEntityUnits).where(eq(planningEntityUnits.governmentEntityId, governmentEntityId));
  return result.total;
}

export async function listCostScopeUnits(db: DatabaseExecutor, governmentEntityId: string): Promise<{ budgetUnitId: string }[]> {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(eq(planningEntityUnits.governmentEntityId, governmentEntityId));
}

export async function listFinancialEntityYears(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  const years = await db.select({ year: financialYears, governmentEntity: { name: governmentEntities.name } }).from(financialYears)
    .leftJoin(governmentEntities, eq(governmentEntities.id, financialYears.governmentEntityId))
    .where(and(isNotNull(financialYears.governmentEntityId), allowedBudgetUnitIds ? sql`EXISTS(SELECT 1 FROM "PlanningEntityUnit" u WHERE u."governmentEntityId"=${financialYears.governmentEntityId} AND ${inArray(sql`u."budgetUnitId"`, allowedBudgetUnitIds)})` : undefined))
    .orderBy(desc(financialYears.year), asc(financialYears.id));
  return years.map(({ year, governmentEntity }) => ({ ...year, governmentEntity }));
}
export async function listOpenExecutionYears(db: DatabaseExecutor, governmentEntityId: string, date: Date) {
  return db.select().from(financialYears).where(and(eq(financialYears.governmentEntityId, governmentEntityId), lte(financialYears.startDate, date), gte(financialYears.endDate, date), eq(financialYears.status, "Aberto")));
}
export async function findPostingYear(db: DatabaseExecutor, governmentEntityId: string | null, year: number) {
  const [row] = await db.select().from(financialYears).where(and(eq(financialYears.year, year), governmentEntityId === null ? isNull(financialYears.governmentEntityId) : eq(financialYears.governmentEntityId, governmentEntityId))).limit(1);
  return row ?? null;
}
