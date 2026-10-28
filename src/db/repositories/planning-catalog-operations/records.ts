import { and, eq, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { planningInstruments, planningLines, planningMovements } from "@/db/schema/planning-budget";
import { planningIndicators, planningObjectives, planningPrograms } from "@/db/schema/planning-legal";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import type { PlanningContext } from "@/lib/planejamento/access";
import { AccessError } from "@/lib/platform/tenant-context";

/** Draft-only instrument lock, with the original visibility check and re-read. */
export async function lockCatalogDraftInstrument(tx: DatabaseTransaction, context: PlanningContext, id: string) {
  const [visible] = await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(and(eq(planningInstruments.id, id), planningInstrumentScope(context))).limit(1);
  if (!visible) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(eq(planningInstruments.id, id)).for("update");
  const piece = await readPlanningInstrument(tx, id, context);
  if (!piece) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  if ((piece.multiYearPlan?.status ?? piece.budgetGuideline?.status ?? piece.annualBudgetLaw?.status) !== "DRAFT") throw new Error("A peça está fechada para elaboração. Utilize o fluxo de revisão legal.");
  return piece;
}

export async function requireCatalogLine(db: DatabaseExecutor, context: PlanningContext, where: SQL) {
  const [line] = await db.select().from(planningLines).where(and(planningLineScope(context), where)).limit(1);
  if (!line) throw new Error("Previsão não encontrada neste escopo.");
  return line;
}

export async function readCatalogLinePosition(db: DatabaseExecutor, lineId: string) {
  const [line] = await db.select({ originalValue: planningLines.originalValue }).from(planningLines).where(eq(planningLines.id, lineId)).limit(1);
  if (!line) throw new Error("Previsão não encontrada.");
  const movements = await db.select({ value: planningMovements.value }).from(planningMovements).where(eq(planningMovements.lineId, lineId));
  return movements.reduce((value, movement) => value.plus(movement.value), line.originalValue);
}

export async function readCatalogProgram(db: DatabaseExecutor, id: string) {
  const [program] = await db.select().from(planningPrograms).where(eq(planningPrograms.id, id)).limit(1);
  if (!program) throw new Error("Programa não encontrado.");
  const objectives = await db.select().from(planningObjectives).where(eq(planningObjectives.programId, id));
  return { ...program, objectives: await Promise.all(objectives.map(async objective => ({ ...objective, indicators: await db.select().from(planningIndicators).where(eq(planningIndicators.objectiveId, objective.id)) }))) };
}

/** Recreates the nested program/objective/indicator tree on the caller's tx. Float
 * indicators stay numbers; exact budget/physical values are handled separately. */
export async function copyCatalogProgram(tx: DatabaseTransaction, ppaId: string, source: Awaited<ReturnType<typeof readCatalogProgram>>) {
  const [program] = await tx.insert(planningPrograms).values({ multiYearPlanId: ppaId, code: source.code, name: source.name, type: source.type, origin: source.origin, guidelines: source.guidelines, targetAudience: source.targetAudience, financing: source.financing, managerName: source.managerName }).returning();
  for (const objective of source.objectives) {
    const [created] = await tx.insert(planningObjectives).values({ programId: program.id, code: objective.code, description: objective.description }).returning();
    if (objective.indicators.length) await tx.insert(planningIndicators).values(objective.indicators.map(indicator => ({ objectiveId: created.id, name: indicator.name, unit: indicator.unit, baselineValue: indicator.baselineValue, targetValue: indicator.targetValue })));
  }
  return program;
}
