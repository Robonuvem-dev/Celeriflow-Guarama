import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { financePagePersonnelDefinitions, financePageRevenues, financePageRevenueReversals } from "../../schema/finance-pages";
import { planningRevenueNatures, planningResourceSources } from "../../schema/planning-legal";
import { planningRevenueRedistributions } from "../../schema/planning-financial-sources";
import { accountingTransactions } from "../../schema/finance-accounting";

export async function listFinancePageRevenues(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const rows = await db.select({ revenue: financePageRevenues,
    revenueNature: { code: planningRevenueNatures.code, name: planningRevenueNatures.name }, resourceSource: { code: planningResourceSources.code, name: planningResourceSources.name },
    reversal: { id: financePageRevenueReversals.id } }).from(financePageRevenues)
    .innerJoin(planningRevenueNatures, eq(planningRevenueNatures.id, financePageRevenues.revenueNatureId))
    .innerJoin(planningResourceSources, eq(planningResourceSources.id, financePageRevenues.resourceSourceId))
    .leftJoin(financePageRevenueReversals, eq(financePageRevenueReversals.revenueId, financePageRevenues.id))
    .where(access.allowedBudgetUnitIds ? inArray(financePageRevenues.budgetUnitId, access.allowedBudgetUnitIds) : undefined)
    .orderBy(desc(financePageRevenues.date), desc(financePageRevenues.createdAt)).limit(100);
  const redistributions = await db.select({ revenueId: planningRevenueRedistributions.revenueId, valueDecimal: planningRevenueRedistributions.valueDecimal }).from(planningRevenueRedistributions)
    .where(inArray(planningRevenueRedistributions.revenueId, rows.map(row => row.revenue.id)));
  return rows.map(({ revenue, ...relations }) => ({ ...revenue, ...relations, resourceRedistributions: redistributions.filter(row => row.revenueId === revenue.id) }));
}

export async function listFinancePageRevenueNatures(db: DatabaseExecutor) {
  return db.select().from(planningRevenueNatures).orderBy(asc(planningRevenueNatures.code));
}

export async function listFinancePagePersonnelSources(db: DatabaseExecutor, governmentEntityId: string, budgetUnitIds: string[]) {
  return db.selectDistinct({ sourceType: accountingTransactions.sourceType }).from(accountingTransactions)
    .where(and(eq(accountingTransactions.governmentEntityId, governmentEntityId), inArray(accountingTransactions.budgetUnitId, budgetUnitIds))).orderBy(asc(accountingTransactions.sourceType));
}

export async function listFinancePagePersonnelRevisions(db: DatabaseExecutor, financialYearId: string) {
  return db.select().from(financePagePersonnelDefinitions).where(eq(financePagePersonnelDefinitions.financialYearId, financialYearId)).orderBy(desc(financePagePersonnelDefinitions.revision));
}
