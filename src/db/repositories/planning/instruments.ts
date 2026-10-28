import { eq, and } from "drizzle-orm";
import { planningBudgetLaws, planningGuidelines, planningInstruments, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { financialYears } from "@/db/schema/finance-years";
import type { DatabaseExecutor } from "@/db/transaction";
import { planningInstrumentScope } from "./scope";
import type { PlanningContext } from "@/lib/planejamento/access";

export async function readPlanningInstrument(db: DatabaseExecutor, id: string, context?: PlanningContext) {
  const [piece] = await db.select().from(planningInstruments).where(and(eq(planningInstruments.id, id), context ? planningInstrumentScope(context) : undefined)).limit(1);
  if (!piece) return null;
  const [multiYearPlan, budgetGuideline, annualBudgetLaw, parentRows] = await Promise.all([
    piece.multiYearPlanId ? db.select().from(planningMultiYearPlans).where(eq(planningMultiYearPlans.id, piece.multiYearPlanId)).limit(1).then(rows => rows[0] ?? null) : null,
    piece.budgetGuidelineId ? db.select().from(planningGuidelines).where(eq(planningGuidelines.id, piece.budgetGuidelineId)).limit(1).then(rows => rows[0] ?? null) : null,
    piece.annualBudgetLawId ? db.select({ law: planningBudgetLaws, financialYear: financialYears }).from(planningBudgetLaws).innerJoin(financialYears, eq(financialYears.id, planningBudgetLaws.financialYearId)).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId)).limit(1).then(rows => rows[0] ? { ...rows[0].law, financialYear: rows[0].financialYear } : null) : null,
    piece.parentId ? db.select().from(planningInstruments).where(eq(planningInstruments.id, piece.parentId)).limit(1) : [],
  ]);
  const parent = parentRows[0];
  const [grandparent] = parent?.parentId ? await db.select().from(planningInstruments).where(eq(planningInstruments.id, parent.parentId)).limit(1) : [];
  return { ...piece, multiYearPlan, budgetGuideline, annualBudgetLaw, parent: parent ? { ...parent, parent: grandparent ?? null } : null };
}
