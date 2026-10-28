import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { financialYears } from "../../schema/finance-years";
import { governmentEntities } from "../../schema/master-data";
import { planningBudgetUnitLabels, planningEntityUnits } from "../../schema/planning-catalog";
import { accountingPlans } from "../../schema/finance-accounting";
import { planningResourceSources as resourceSources } from "../../schema/planning-legal";

export async function listFinancePageYears(db: DatabaseExecutor, access: FinancePageAccess = {}, entityIds?: string[]) {
  const rows = await db.select({ year: financialYears, governmentEntity: { name: governmentEntities.name } })
    .from(financialYears).leftJoin(governmentEntities, eq(governmentEntities.id, financialYears.governmentEntityId))
    .where(and(entityIds ? inArray(financialYears.governmentEntityId, entityIds) : undefined,
      access.allowedBudgetUnitIds ? sql`EXISTS (SELECT 1 FROM ${planningEntityUnits} WHERE ${planningEntityUnits.governmentEntityId} = ${financialYears.governmentEntityId} AND ${inArray(planningEntityUnits.budgetUnitId, access.allowedBudgetUnitIds)})` : undefined))
    .orderBy(desc(financialYears.year), asc(financialYears.id));
  return rows.map(({ year, governmentEntity }) => ({ ...year, governmentEntity }));
}

export async function listFinancePageUnits(db: DatabaseExecutor, access: FinancePageAccess = {}, entityIds?: string[], order: "entity" | "code" = "entity") {
  return db.select({ governmentEntityId: planningEntityUnits.governmentEntityId, budgetUnitId: planningEntityUnits.budgetUnitId,
    governmentEntity: { name: governmentEntities.name, type: governmentEntities.type },
    budgetUnit: { id: planningBudgetUnitLabels.id, code: planningBudgetUnitLabels.code, name: planningBudgetUnitLabels.name } })
    .from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId))
    .innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId))
    .where(and(access.allowedBudgetUnitIds ? inArray(planningEntityUnits.budgetUnitId, access.allowedBudgetUnitIds) : undefined,
      entityIds ? inArray(planningEntityUnits.governmentEntityId, entityIds) : undefined))
    .orderBy(...(order === "code" ? [asc(planningBudgetUnitLabels.code)] : [asc(planningEntityUnits.governmentEntityId), asc(planningEntityUnits.budgetUnitId)]));
}

export async function listFinancePageAccounts(db: DatabaseExecutor, type?: string) {
  return db.select({ id: accountingPlans.id, code: accountingPlans.code, name: accountingPlans.name })
    .from(accountingPlans).where(type ? eq(accountingPlans.type, type) : undefined).orderBy(asc(accountingPlans.code));
}

export async function listFinancePageSources(db: DatabaseExecutor, order: "code" | "name" = "code") {
  return db.select().from(resourceSources).orderBy(asc(order === "code" ? resourceSources.code : resourceSources.name));
}
