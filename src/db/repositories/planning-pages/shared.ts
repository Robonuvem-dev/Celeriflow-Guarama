import { and, asc, eq, getTableColumns, ilike, or, sql, type SQLWrapper } from "drizzle-orm";
import type { PlanningContext } from "@/lib/planejamento/access";
import type { ReadExecutor } from "@/lib/contracts/planning-pages";
import { planningDatabase } from "@/lib/planejamento/database";
import { planningEntityScope, planningInstrumentScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { planningBudgetLaws, planningBudgetUnits as units, planningEntityUnits, planningGuidelines, planningInstruments as instruments, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { governmentEntities } from "@/db/schema/master-data";
import { documentClasses } from "@/db/schema/document-workflow";
import { alias } from "drizzle-orm/pg-core";

export function pageDatabase(context: PlanningContext): ReadExecutor { return planningDatabase(context); }
export const contains = (column: SQLWrapper, value?: string) => value ? ilike(sql`${column}`, `%${value}%`) : undefined;
export function pageNumber(input: string | number | undefined, total: number) { const n = Number(input ?? 1); return Math.min(Number.isSafeInteger(n) && n > 0 ? n : 1, Math.max(1, Math.ceil(total / 20))); }
export const offset = (page: number) => (page - 1) * 20;
const parent = alias(instruments, "pageParent"), grandparent = alias(instruments, "pageGrandparent");
export async function pageInstrument(database: ReadExecutor, context: PlanningContext, id: string) {
  const [row] = await database.select({ piece: instruments, multiYearPlan: planningMultiYearPlans, budgetGuideline: planningGuidelines, annualBudgetLaw: planningBudgetLaws, parent: getTableColumns(parent), grandparent: getTableColumns(grandparent) }).from(instruments).leftJoin(planningMultiYearPlans, eq(planningMultiYearPlans.id, instruments.multiYearPlanId)).leftJoin(planningGuidelines, eq(planningGuidelines.id, instruments.budgetGuidelineId)).leftJoin(planningBudgetLaws, eq(planningBudgetLaws.id, instruments.annualBudgetLawId)).leftJoin(parent, eq(parent.id, instruments.parentId)).leftJoin(grandparent, eq(grandparent.id, parent.parentId)).where(and(eq(instruments.id, id), planningInstrumentScope(context))).limit(1);
  if (!row) throw new Error("Peça orçamentária não encontrada.");
  return { ...row.piece, multiYearPlan: row.multiYearPlan, budgetGuideline: row.budgetGuideline, annualBudgetLaw: row.annualBudgetLaw, parent: row.parent ? { ...row.parent, parent: row.grandparent } : null };
}
export function pageEntityOptions(database: ReadExecutor, context: PlanningContext, limit?: number) {
  const query = database.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(planningEntityScope(context, governmentEntities.id));
  return limit ? query.orderBy(asc(governmentEntities.name), asc(governmentEntities.id)).limit(limit) : query.orderBy(asc(governmentEntities.name));
}
export function pageUnitOptions(database: ReadExecutor, context: PlanningContext, entityId?: string, limit?: number) {
  const query = database.select({ id: units.id, name: units.name }).from(units).where(and(planningUnitScope(context, units.id), entityId ? sql`EXISTS (SELECT 1 FROM ${planningEntityUnits} WHERE ${planningEntityUnits.budgetUnitId}=${units.id} AND ${planningEntityUnits.governmentEntityId}=${entityId})` : undefined)).orderBy(asc(units.name));
  return limit ? query.limit(limit) : query;
}
export function pageDocumentClasses(database: ReadExecutor) {
  return database.select({ code: documentClasses.code, label: documentClasses.label }).from(documentClasses).where(and(eq(documentClasses.isActive, true), or(sql`starts_with(${documentClasses.code}, 'PLANEJAMENTO')`, sql`starts_with(${documentClasses.code}, 'PLANNING')`))).orderBy(asc(documentClasses.code));
}
