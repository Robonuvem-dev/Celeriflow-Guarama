import { and, asc, count, eq, getTableColumns, inArray } from "drizzle-orm";
import type { ReadExecutor } from "@/lib/contracts/planning-pages";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { planningBudgetLaws, planningBudgetUnits, planningCreditBatches, planningCreditLines, planningGuidelines, planningInstruments, planningLines, planningMovements, planningQuotas, planningQuotaEvents } from "@/db/schema/planning-budget";
import { planningActions, planningExpenseNatures, planningFiscalRules, planningGoals, planningIndicators, planningMemories, planningObjectives, planningPhysicalEvents, planningPlannedWorks, planningPrograms, planningResourceSources, planningRevenueNatures, planningWaivers } from "@/db/schema/planning-legal";
import { pageReportSnapshots } from "@/db/schema/planning-pages";
import { governmentEntities } from "@/db/schema/master-data";
import { secretariats } from "@/db/schema/administration";
import { financeCreditRequests } from "@/db/schema/finance-legacy-budget";

export async function pageReportPieces(database: ReadExecutor, context: PlanningContext, ids: string[]) {
  const rows = await database.select({ piece: planningInstruments, governmentEntity: governmentEntities }).from(planningInstruments).innerJoin(governmentEntities, eq(governmentEntities.id, planningInstruments.governmentEntityId)).where(and(inArray(planningInstruments.id, ids), planningInstrumentScope(context))).orderBy(asc(planningInstruments.id));
  return Promise.all(rows.map(async ({ piece, governmentEntity }) => {
    const [memories, waivers, fiscalRules, plannedWorks] = await Promise.all([
      database.select().from(planningMemories).where(eq(planningMemories.instrumentId, piece.id)), database.select().from(planningWaivers).where(eq(planningWaivers.instrumentId, piece.id)), database.select().from(planningFiscalRules).where(eq(planningFiscalRules.instrumentId, piece.id)), database.select().from(planningPlannedWorks).where(eq(planningPlannedWorks.instrumentId, piece.id)),
    ]);
    return { ...piece, governmentEntity, memories, waivers, fiscalRules, plannedWorks };
  }));
}
export async function pageReportPrograms(database: ReadExecutor, piece: { multiYearPlanId: string | null; budgetGuidelineId: string | null; annualBudgetLawId: string | null }) {
  let ppaId = piece.multiYearPlanId;
  if (!ppaId && piece.budgetGuidelineId) ppaId = (await database.select({ id: planningGuidelines.multiYearPlanId }).from(planningGuidelines).where(eq(planningGuidelines.id, piece.budgetGuidelineId)))[0]?.id ?? null;
  if (!ppaId && piece.annualBudgetLawId) ppaId = (await database.select({ id: planningGuidelines.multiYearPlanId }).from(planningBudgetLaws).innerJoin(planningGuidelines, eq(planningGuidelines.id, planningBudgetLaws.budgetGuidelineId)).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId)))[0]?.id ?? null;
  if (!ppaId) return [];
  const programs = await database.select().from(planningPrograms).where(eq(planningPrograms.multiYearPlanId, ppaId)).orderBy(asc(planningPrograms.code), asc(planningPrograms.id));
  return Promise.all(programs.map(async program => {
    const objectives = await database.select().from(planningObjectives).where(eq(planningObjectives.programId, program.id));
    const actions = await database.select().from(planningActions).where(eq(planningActions.programId, program.id));
    return { ...program, objectives: await Promise.all(objectives.map(async objective => ({ ...objective, indicators: await database.select().from(planningIndicators).where(eq(planningIndicators.objectiveId, objective.id)) }))), actions: await Promise.all(actions.map(async action => ({ ...action, goals: await database.select().from(planningGoals).where(eq(planningGoals.actionId, action.id)) }))) };
  }));
}
export async function pageReportLines(database: ReadExecutor, context: PlanningContext, id: string, input: { year?: number; unitId?: string; sourceId?: string }) {
  const where = and(eq(planningLines.instrumentId, id), planningLineScope(context), input.year ? eq(planningLines.year, input.year) : undefined, input.unitId ? eq(planningLines.budgetUnitId, input.unitId) : undefined, input.sourceId ? eq(planningLines.resourceSourceId, input.sourceId) : undefined);
  const rows = await database.select({ line: planningLines, budgetUnit: planningBudgetUnits, secretariat: secretariats, resourceSource: planningResourceSources, revenueNature: planningRevenueNatures, expenseNature: planningExpenseNatures, program: planningPrograms, action: planningActions }).from(planningLines).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, planningLines.budgetUnitId)).innerJoin(secretariats, eq(secretariats.id, planningBudgetUnits.secretariatId)).innerJoin(planningResourceSources, eq(planningResourceSources.id, planningLines.resourceSourceId)).leftJoin(planningRevenueNatures, eq(planningRevenueNatures.id, planningLines.revenueNatureId)).leftJoin(planningExpenseNatures, eq(planningExpenseNatures.id, planningLines.expenseNatureId)).leftJoin(planningPrograms, eq(planningPrograms.id, planningLines.programId)).leftJoin(planningActions, eq(planningActions.id, planningLines.actionId)).where(where).orderBy(asc(planningLines.year), asc(planningLines.code), asc(planningLines.id));
  const lineIds = rows.map(row => row.line.id), programIds = [...new Set(rows.flatMap(row => row.program ? [row.program.id] : []))];
  const [movements, physicalEvents, quotas, objectives, destinations] = await Promise.all([
    database.select().from(planningMovements).where(inArray(planningMovements.lineId, lineIds)),
    database.select().from(planningPhysicalEvents).where(inArray(planningPhysicalEvents.lineId, lineIds)).orderBy(asc(planningPhysicalEvents.effectiveAt), asc(planningPhysicalEvents.createdAt), asc(planningPhysicalEvents.id)),
    database.select().from(planningQuotas).where(inArray(planningQuotas.lineId, lineIds)).orderBy(asc(planningQuotas.month)),
    database.select().from(planningObjectives).where(inArray(planningObjectives.programId, programIds)),
    database.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(inArray(governmentEntities.id, rows.flatMap(row => row.line.destinationEntityId ? [row.line.destinationEntityId] : []))),
  ]);
  const [indicators, events] = await Promise.all([
    database.select().from(planningIndicators).where(inArray(planningIndicators.objectiveId, objectives.map(row => row.id))),
    database.select().from(planningQuotaEvents).where(inArray(planningQuotaEvents.quotaId, quotas.map(row => row.id))),
  ]);
  return rows.map(row => ({
    ...row.line, budgetUnit: { ...row.budgetUnit, secretariat: row.secretariat }, resourceSource: row.resourceSource, revenueNature: row.revenueNature, expenseNature: row.expenseNature,
    program: row.program ? { ...row.program, objectives: objectives.filter(objective => objective.programId === row.program?.id).map(objective => ({ ...objective, indicators: indicators.filter(indicator => indicator.objectiveId === objective.id) })) } : null,
    action: row.action, destinationEntity: destinations.find(entity => entity.id === row.line.destinationEntityId) ?? null,
    movements: movements.filter(movement => movement.lineId === row.line.id), physicalEvents: physicalEvents.filter(event => event.lineId === row.line.id),
    quotas: quotas.filter(quota => quota.lineId === row.line.id).map(quota => ({ ...quota, events: events.filter(event => event.quotaId === quota.id) })),
  }));
}
export async function pageReportCredits(database: ReadExecutor, ids: string[], input: { creditId?: string; origin?: string }) {
  const rows = await database.select().from(planningCreditBatches).where(and(inArray(planningCreditBatches.instrumentId, ids), input.creditId ? eq(planningCreditBatches.id, input.creditId) : undefined, input.origin ? eq(planningCreditBatches.origin, input.origin) : undefined));
  const items = await database.select().from(planningCreditLines).where(inArray(planningCreditLines.batchId, rows.map(row => row.id)));
  return rows.map(row => ({ ...row, items: items.filter(item => item.batchId === row.id) }));
}
export async function pageReportCredit(database: ReadExecutor, ids: string[], id: string) {
  const [row] = await database.select({ ...getTableColumns(planningCreditBatches), creditRequest: financeCreditRequests }).from(planningCreditBatches).innerJoin(financeCreditRequests, eq(financeCreditRequests.id, planningCreditBatches.creditRequestId)).where(and(eq(planningCreditBatches.id, id), inArray(planningCreditBatches.instrumentId, ids))).limit(1);
  if (!row) throw new Error("Lote de crédito não encontrado.");
  const items = await database.select({ ...getTableColumns(planningCreditLines), line: planningLines }).from(planningCreditLines).innerJoin(planningLines, eq(planningLines.id, planningCreditLines.lineId)).where(eq(planningCreditLines.batchId, row.id));
  return { ...row, items };
}
export async function pageSnapshotUnits(database: ReadExecutor, context: PlanningContext, ids: string[]) { return database.selectDistinct({ budgetUnitId: planningLines.budgetUnitId }).from(planningLines).where(and(inArray(planningLines.instrumentId, ids), planningLineScope(context))); }
export async function pagePreservedReport(database: ReadExecutor, context: PlanningContext, id: string) { return (await database.select().from(pageReportSnapshots).where(and(eq(pageReportSnapshots.id, id), planningInstrumentScope(context, pageReportSnapshots.instrumentId))).limit(1))[0] ?? null; }
export async function pageVisiblePieceCount(database: ReadExecutor, context: PlanningContext, ids: string[]) { return (await database.select({ value: count() }).from(planningInstruments).where(and(inArray(planningInstruments.id, ids), planningInstrumentScope(context))))[0].value; }
