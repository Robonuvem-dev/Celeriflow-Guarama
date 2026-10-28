import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { planningBudgetLaws, planningBudgetUnits, planningGuidelines, planningMultiYearPlans } from "../../schema/planning-budget";
import { planningActions, planningExpenseNatures, planningFixations, planningObjectives, planningPrograms } from "../../schema/planning-legal";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { revenues } from "../../schema/finance-revenues";
import { financeCreditRequests, financeCreditItems } from "../../schema/finance-legacy-budget";

export async function findFinanceLegacyPiece(db: DatabaseExecutor, kind: "PPA" | "LDO" | "LOA", id: string) {
  if (kind === "PPA") { const [row] = await db.select().from(planningMultiYearPlans).where(eq(planningMultiYearPlans.id, id)); return row ?? null; }
  if (kind === "LDO") { const [row] = await db.select().from(planningGuidelines).where(eq(planningGuidelines.id, id)); return row ?? null; }
  const [row] = await db.select().from(planningBudgetLaws).where(eq(planningBudgetLaws.id, id)); return row ?? null;
}
export async function findFinanceLegacyPlan(db: DatabaseExecutor, filter: { id: string } | { code: string }) {
  const [row] = await db.select().from(planningMultiYearPlans).where("id" in filter ? eq(planningMultiYearPlans.id, filter.id) : eq(planningMultiYearPlans.code, filter.code));
  return row ?? null;
}
export async function findFinanceLegacyGuideline(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(planningGuidelines).where(eq(planningGuidelines.id, id)); return row ?? null;
}
export async function findFinanceLegacyLaw(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(planningBudgetLaws).where(eq(planningBudgetLaws.id, id)); return row ?? null;
}
export async function isFinanceLegacyPieceAdopted(db: DatabaseExecutor, kind: "PPA" | "LDO" | "LOA", id: string) {
  const [runtime] = (await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningInstrument"') IS NOT NULL AS ready`)).rows;
  if (!runtime?.ready) return false;
  const column = { PPA: "multiYearPlanId", LDO: "budgetGuidelineId", LOA: "annualBudgetLawId" }[kind];
  return (await db.execute(sql`SELECT id FROM "PlanningInstrument" WHERE ${sql.identifier(column)}=${id} LIMIT 1`)).rows.length > 0;
}
export async function isFinanceCreditPlanningOwned(db: DatabaseExecutor, id: string) {
  const [runtime] = (await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningCreditBatch"') IS NOT NULL AS ready`)).rows;
  return Boolean(runtime?.ready && (await db.execute(sql`SELECT id FROM "PlanningCreditBatch" WHERE "creditRequestId"=${id} LIMIT 1`)).rows.length);
}
export async function findFinanceLegacyProgram(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ program: planningPrograms, multiYearPlan: planningMultiYearPlans }).from(planningPrograms).innerJoin(planningMultiYearPlans, eq(planningMultiYearPlans.id, planningPrograms.multiYearPlanId)).where(eq(planningPrograms.id, id));
  return row ? { ...row.program, multiYearPlan: row.multiYearPlan } : null;
}
export async function findFinanceLegacyObjective(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(planningObjectives).where(eq(planningObjectives.id, id));
  if (!row) return null;
  const program = await findFinanceLegacyProgram(db, row.programId);
  return program ? { ...row, program } : null;
}
export async function findFinanceLegacyAction(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(planningActions).where(eq(planningActions.id, id));
  if (!row) return null;
  const program = await findFinanceLegacyProgram(db, row.programId);
  return program ? { ...row, program } : null;
}
export async function findFinanceLegacyFixation(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ fixation: planningFixations, law: planningBudgetLaws, guideline: planningGuidelines }).from(planningFixations).innerJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningFixations.annualBudgetLawId)).leftJoin(planningGuidelines, eq(planningGuidelines.id, planningBudgetLaws.budgetGuidelineId)).where(eq(planningFixations.id, id));
  return row ? { ...row.fixation, annualBudgetLaw: { ...row.law, budgetGuideline: row.guideline } } : null;
}
export async function listFinanceLegacyAppropriations(db: DatabaseExecutor, filter: { ids?: string[]; fixationId?: string; financialYearId?: string }) {
  const rows = await db.select({ appropriation: budgetAppropriations, budgetUnit: { code: planningBudgetUnits.code, name: planningBudgetUnits.name }, expenseNature: { code: planningExpenseNatures.code, name: planningExpenseNatures.name } }).from(budgetAppropriations).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, budgetAppropriations.budgetUnitId)).innerJoin(planningExpenseNatures, eq(planningExpenseNatures.id, budgetAppropriations.expenseNatureId)).where(and(filter.ids ? inArray(budgetAppropriations.id, filter.ids) : undefined, filter.fixationId ? eq(budgetAppropriations.annualBudgetExpenseFixationId, filter.fixationId) : undefined, filter.financialYearId ? eq(budgetAppropriations.financialYearId, filter.financialYearId) : undefined));
  return rows.map(({ appropriation, budgetUnit, expenseNature }) => ({ ...appropriation, budgetUnit, expenseNature }));
}
export async function findFinanceLegacyRegistry(db: DatabaseExecutor, kind: "BudgetUnit" | "ExpenseNature" | "ResourceSource", id: string) {
  const [row] = (await db.execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(kind)} WHERE id=${id}`)).rows; return row ?? null;
}
export async function findFinanceCredit(db: DatabaseExecutor, filter: { id: string } | { number: string }) {
  const [row] = await db.select().from(financeCreditRequests).where("id" in filter ? eq(financeCreditRequests.id, filter.id) : eq(financeCreditRequests.number, filter.number)); return row ?? null;
}
export async function readFinanceCreditItems(db: DatabaseExecutor, id: string) {
  const credit = await findFinanceCredit(db, { id });
  if (!credit) return null;
  const items = await db.select({ item: financeCreditItems, appropriation: { financialYearId: budgetAppropriations.financialYearId, budgetUnitId: budgetAppropriations.budgetUnitId } }).from(financeCreditItems).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, financeCreditItems.appropriationId)).where(eq(financeCreditItems.creditRequestId, id));
  return { ...credit, items: items.map(({ item, appropriation }) => ({ ...item, appropriation })) };
}
export async function readFinanceCmdMbaFacts(db: DatabaseExecutor, financialYearId: string) {
  const [committed, collected] = await Promise.all([
    db.select({ date: commitments.date, valueDecimal: commitments.valueDecimal, value: commitments.value, appropriation: { budgetUnitId: budgetAppropriations.budgetUnitId } }).from(commitments).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).where(and(eq(budgetAppropriations.financialYearId, financialYearId), inArray(commitments.status, ["Emitido", "Liquidado", "Pago"]))),
    db.select({ collectionDate: revenues.collectionDate, valueDecimal: revenues.valueDecimal, value: revenues.value }).from(revenues).where(and(eq(revenues.financialYearId, financialYearId), eq(revenues.stage, "ARRECADADA"))),
  ]);
  return { commitments: committed, revenues: collected };
}
