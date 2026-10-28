import { and, asc, eq, lte, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { planningBudgetUnits, planningDocumentLinks, planningLines, planningMovements, planningQuotas, planningQuotaEvents } from "@/db/schema/planning-budget";
import { planningActions, planningAnnualPrograms, planningCatalogEntries, planningExpenseNatures, planningFiscalRules, planningGoals, planningIndicators, planningInstrumentSources, planningLegislativeLinks, planningMemories, planningObjectives, planningPhysicalEvents, planningPlannedWorks, planningPriorities, planningPrograms, planningRevenueNatures, planningResourceSources, planningRisks, planningWaivers } from "@/db/schema/planning-legal";
import { governmentEntities } from "@/db/schema/master-data";
import { secretariats } from "@/db/schema/administration";
import { laws, propositions } from "@/db/schema/chamber";
import { readPlanningInstrument } from "./instruments";

export async function readPlanningPrograms(db: DatabaseExecutor, ppaId: string) {
  const programs = await db.select().from(planningPrograms).where(eq(planningPrograms.multiYearPlanId, ppaId)).orderBy(asc(planningPrograms.code), asc(planningPrograms.id));
  return Promise.all(programs.map(async program => {
    const objectives = await db.select().from(planningObjectives).where(eq(planningObjectives.programId, program.id));
    const actions = await db.select().from(planningActions).where(eq(planningActions.programId, program.id));
    return { ...program, objectives: await Promise.all(objectives.map(async objective => ({ ...objective, indicators: await db.select().from(planningIndicators).where(eq(planningIndicators.objectiveId, objective.id)) }))), actions: await Promise.all(actions.map(async action => ({ ...action, goals: await db.select().from(planningGoals).where(eq(planningGoals.actionId, action.id)) }))) };
  }));
}

/** Complete immutable report/version source, with exact numerics decoded by each table. */
export async function readPlanningSnapshotLines(db: DatabaseExecutor, where: SQL, asOf?: Date) {
  const rows = await db.select({ line: planningLines, budgetUnit: planningBudgetUnits, secretariat: secretariats, resourceSource: planningResourceSources, revenueNature: planningRevenueNatures, expenseNature: planningExpenseNatures, program: planningPrograms, action: planningActions, destinationEntity: governmentEntities }).from(planningLines).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, planningLines.budgetUnitId)).innerJoin(secretariats, eq(secretariats.id, planningBudgetUnits.secretariatId)).innerJoin(planningResourceSources, eq(planningResourceSources.id, planningLines.resourceSourceId)).leftJoin(planningRevenueNatures, eq(planningRevenueNatures.id, planningLines.revenueNatureId)).leftJoin(planningExpenseNatures, eq(planningExpenseNatures.id, planningLines.expenseNatureId)).leftJoin(planningPrograms, eq(planningPrograms.id, planningLines.programId)).leftJoin(planningActions, eq(planningActions.id, planningLines.actionId)).leftJoin(governmentEntities, eq(governmentEntities.id, planningLines.destinationEntityId)).where(where).orderBy(asc(planningLines.year), asc(planningLines.code), asc(planningLines.id));
  return Promise.all(rows.map(async row => {
    const [movements, physicalEvents, quotas, objectives] = await Promise.all([
      db.select().from(planningMovements).where(and(eq(planningMovements.lineId, row.line.id), asOf ? lte(planningMovements.effectiveAt, asOf) : undefined)).orderBy(asc(planningMovements.effectiveAt), asc(planningMovements.createdAt), asc(planningMovements.id)),
      db.select().from(planningPhysicalEvents).where(and(eq(planningPhysicalEvents.lineId, row.line.id), asOf ? lte(planningPhysicalEvents.effectiveAt, asOf) : undefined)).orderBy(asc(planningPhysicalEvents.effectiveAt), asc(planningPhysicalEvents.createdAt), asc(planningPhysicalEvents.id)),
      db.select().from(planningQuotas).where(eq(planningQuotas.lineId, row.line.id)).orderBy(asc(planningQuotas.month)),
      row.program ? db.select().from(planningObjectives).where(eq(planningObjectives.programId, row.program.id)) : [],
    ]);
    return { ...row.line, budgetUnit: { ...row.budgetUnit, secretariat: row.secretariat }, resourceSource: row.resourceSource, revenueNature: row.revenueNature, expenseNature: row.expenseNature, program: row.program ? { ...row.program, objectives: await Promise.all(objectives.map(async objective => ({ ...objective, indicators: await db.select().from(planningIndicators).where(eq(planningIndicators.objectiveId, objective.id)) }))) } : null, action: row.action, destinationEntity: row.destinationEntity, movements, physicalEvents, quotas: await Promise.all(quotas.map(async quota => ({ ...quota, events: await db.select().from(planningQuotaEvents).where(eq(planningQuotaEvents.quotaId, quota.id)) }))) };
  }));
}

export async function readPlanningSnapshotPiece(db: DatabaseExecutor, instrumentId: string) {
  const piece = await readPlanningInstrument(db, instrumentId);
  if (!piece) throw new Error("Peça orçamentária não encontrada.");
  const [governmentEntity] = await db.select().from(governmentEntities).where(eq(governmentEntities.id, piece.governmentEntityId)).limit(1);
  if (!governmentEntity) throw new Error("Entidade orçamentária não encontrada.");
  const [memories, waivers, fiscalRules, plannedWorks, priorities, risks] = await Promise.all([
    db.select().from(planningMemories).where(eq(planningMemories.instrumentId, piece.id)), db.select().from(planningWaivers).where(eq(planningWaivers.instrumentId, piece.id)), db.select().from(planningFiscalRules).where(eq(planningFiscalRules.instrumentId, piece.id)), db.select().from(planningPlannedWorks).where(eq(planningPlannedWorks.instrumentId, piece.id)),
    piece.budgetGuidelineId ? db.select().from(planningPriorities).where(eq(planningPriorities.budgetGuidelineId, piece.budgetGuidelineId)) : [], piece.budgetGuidelineId ? db.select().from(planningRisks).where(eq(planningRisks.budgetGuidelineId, piece.budgetGuidelineId)) : [],
  ]);
  // Version JSON historically contains only the scalar piece and these explicit relations.
  const { parent: _parent, ...scalarPiece } = piece;
  const annualBudgetLaw = piece.annualBudgetLaw ? (({ financialYear: _year, ...law }) => law)(piece.annualBudgetLaw) : null;
  return { ...scalarPiece, annualBudgetLaw, governmentEntity, memories, waivers, fiscalRules, plannedWorks, budgetGuideline: piece.budgetGuideline ? { ...piece.budgetGuideline, priorities, risks } : null };
}

export async function readPlanningSnapshotReferences(db: DatabaseExecutor, instrumentId: string) {
  const documentLinks = await db.select().from(planningDocumentLinks).where(eq(planningDocumentLinks.instrumentId, instrumentId)).orderBy(asc(planningDocumentLinks.createdAt), asc(planningDocumentLinks.id));
  const bindings = await db.select({ binding: planningInstrumentSources, catalogEntry: planningCatalogEntries }).from(planningInstrumentSources).leftJoin(planningCatalogEntries, eq(planningCatalogEntries.id, planningInstrumentSources.catalogEntryId)).where(eq(planningInstrumentSources.instrumentId, instrumentId)).orderBy(asc(planningInstrumentSources.resourceSourceId));
  const annualPrograms = await db.select().from(planningAnnualPrograms).where(eq(planningAnnualPrograms.instrumentId, instrumentId)).orderBy(asc(planningAnnualPrograms.year), asc(planningAnnualPrograms.programId));
  const links = await db.select({ link: planningLegislativeLinks, proposition: propositions, law: laws }).from(planningLegislativeLinks).leftJoin(propositions, eq(propositions.id, planningLegislativeLinks.propositionId)).leftJoin(laws, eq(laws.id, planningLegislativeLinks.lawId)).where(eq(planningLegislativeLinks.instrumentId, instrumentId)).orderBy(asc(planningLegislativeLinks.createdAt));
  return { documentLinks, sourceBindings: bindings.map(row => ({ ...row.binding, catalogEntry: row.catalogEntry })), annualPrograms, legislativeLinks: links.map(row => ({ ...row.link, proposition: row.proposition, law: row.law })) };
}
