import { and, asc, eq, exists, gte, inArray, lte } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { planningBudgetLaws, planningBudgetUnits, planningGuidelines, planningInstruments, planningMultiYearPlans } from "../../schema/planning-budget";
import { planningActions, planningFixations, planningForecasts, planningGoals, planningIndicators, planningObjectives, planningPriorities, planningPrograms, planningRisks } from "../../schema/planning-legal";
import { financeCmdSchedules, financeMbaTargets, financeCreditRequests, financeCreditItems } from "../../schema/finance-legacy-budget";
import { budgetAppropriations } from "../../schema/finance-budget";

export async function listFinancePlanDocuments(db: DatabaseExecutor, filter: { id?: string; year?: number; governmentEntityId?: string; goalYear?: number }) {
  const plans = await db.select().from(planningMultiYearPlans).where(and(filter.id ? eq(planningMultiYearPlans.id, filter.id) : undefined, filter.year === undefined ? undefined : lte(planningMultiYearPlans.startYear, filter.year), filter.year === undefined ? undefined : gte(planningMultiYearPlans.endYear, filter.year), filter.governmentEntityId ? exists(db.select({ id: planningInstruments.id }).from(planningInstruments).where(and(eq(planningInstruments.multiYearPlanId, planningMultiYearPlans.id), eq(planningInstruments.governmentEntityId, filter.governmentEntityId)))) : undefined)).orderBy(asc(planningMultiYearPlans.code));
  const programs = plans.length ? await db.select().from(planningPrograms).where(inArray(planningPrograms.multiYearPlanId, plans.map(row => row.id))).orderBy(asc(planningPrograms.code)) : [];
  const keys = programs.map(row => row.id);
  const [objectives, actions] = keys.length ? await Promise.all([db.select().from(planningObjectives).where(inArray(planningObjectives.programId, keys)).orderBy(asc(planningObjectives.code)), db.select().from(planningActions).where(inArray(planningActions.programId, keys)).orderBy(asc(planningActions.code))]) : [[], []];
  const [indicators, goals] = await Promise.all([
    objectives.length ? db.select().from(planningIndicators).where(inArray(planningIndicators.objectiveId, objectives.map(row => row.id))).orderBy(asc(planningIndicators.name)) : [],
    actions.length ? db.select().from(planningGoals).where(and(inArray(planningGoals.actionId, actions.map(row => row.id)), filter.goalYear === undefined ? undefined : eq(planningGoals.year, filter.goalYear))).orderBy(asc(planningGoals.year)) : [],
  ]);
  return plans.map(plan => ({ ...plan, programs: programs.filter(row => row.multiYearPlanId === plan.id).map(program => ({ ...program, objectives: objectives.filter(row => row.programId === program.id).map(objective => ({ ...objective, indicators: indicators.filter(row => row.objectiveId === objective.id) })), actions: actions.filter(row => row.programId === program.id).map(action => ({ ...action, goals: goals.filter(row => row.actionId === action.id) })) })) }));
}
export async function listFinanceGuidelineDocuments(db: DatabaseExecutor, filter: { id?: string; financialYearId?: string }) {
  const rows = await db.select({ guideline: planningGuidelines, multiYearPlan: { code: planningMultiYearPlans.code, name: planningMultiYearPlans.name } }).from(planningGuidelines).leftJoin(planningMultiYearPlans, eq(planningMultiYearPlans.id, planningGuidelines.multiYearPlanId)).where(and(filter.id ? eq(planningGuidelines.id, filter.id) : undefined, filter.financialYearId ? eq(planningGuidelines.financialYearId, filter.financialYearId) : undefined)).orderBy(asc(planningGuidelines.createdAt));
  const keys = rows.map(row => row.guideline.id);
  const [priorities, risks] = keys.length ? await Promise.all([db.select().from(planningPriorities).where(inArray(planningPriorities.budgetGuidelineId, keys)), db.select().from(planningRisks).where(inArray(planningRisks.budgetGuidelineId, keys))]) : [[], []];
  return rows.map(({ guideline, multiYearPlan }) => ({ ...guideline, multiYearPlan, priorities: priorities.filter(row => row.budgetGuidelineId === guideline.id), risks: risks.filter(row => row.budgetGuidelineId === guideline.id) }));
}
export async function listFinanceLawDocuments(db: DatabaseExecutor, filter: { id?: string; financialYearId?: string; cmdUnitIds?: string[]; cmdUnitOrder?: boolean }) {
  const laws = await db.select().from(planningBudgetLaws).where(and(filter.id ? eq(planningBudgetLaws.id, filter.id) : undefined, filter.financialYearId ? eq(planningBudgetLaws.financialYearId, filter.financialYearId) : undefined)).orderBy(asc(planningBudgetLaws.publicationDate));
  const keys = laws.map(row => row.id);
  const [revenueForecasts, expenseFixations, cmdSchedules, mbaTargets] = keys.length ? await Promise.all([
    db.select().from(planningForecasts).where(inArray(planningForecasts.annualBudgetLawId, keys)), db.select().from(planningFixations).where(inArray(planningFixations.annualBudgetLawId, keys)),
    db.select().from(financeCmdSchedules).where(and(inArray(financeCmdSchedules.annualBudgetLawId, keys), filter.cmdUnitIds ? inArray(financeCmdSchedules.budgetUnitId, filter.cmdUnitIds) : undefined)).orderBy(...(filter.cmdUnitOrder ? [asc(financeCmdSchedules.budgetUnitId), asc(financeCmdSchedules.month)] : [asc(financeCmdSchedules.month)])),
    db.select().from(financeMbaTargets).where(inArray(financeMbaTargets.annualBudgetLawId, keys)).orderBy(asc(financeMbaTargets.bimonth)),
  ]) : [[], [], [], []];
  return laws.map(law => ({ ...law, revenueForecasts: revenueForecasts.filter(row => row.annualBudgetLawId === law.id), expenseFixations: expenseFixations.filter(row => row.annualBudgetLawId === law.id), cmdSchedules: cmdSchedules.filter(row => row.annualBudgetLawId === law.id), mbaTargets: mbaTargets.filter(row => row.annualBudgetLawId === law.id) }));
}
export async function listFinanceReportUnits(db: DatabaseExecutor, ids?: string[]) {
  return db.select({ id: planningBudgetUnits.id, code: planningBudgetUnits.code, name: planningBudgetUnits.name }).from(planningBudgetUnits).where(ids ? inArray(planningBudgetUnits.id, ids) : undefined);
}
export async function listFinanceReportCredits(db: DatabaseExecutor, financialYearId: string) {
  const credits = await db.select().from(financeCreditRequests).where(eq(financeCreditRequests.financialYearId, financialYearId)).orderBy(asc(financeCreditRequests.createdAt));
  const items = credits.length ? await db.select({ item: financeCreditItems, appropriation: { code: budgetAppropriations.code } }).from(financeCreditItems).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, financeCreditItems.appropriationId)).where(inArray(financeCreditItems.creditRequestId, credits.map(row => row.id))) : [];
  return credits.map(credit => ({ ...credit, items: items.filter(row => row.item.creditRequestId === credit.id).map(({ item, appropriation }) => ({ ...item, appropriation })) }));
}
