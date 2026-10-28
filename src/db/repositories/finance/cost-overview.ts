import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { financialYears } from "../../schema/finance-years";
import { planningBudgetUnitLabels, planningEntityUnits } from "../../schema/planning-catalog";
import { municipalCostAllocations, municipalCostItems, municipalCostMovements, municipalCostObjectItems, municipalCostObjects, municipalCostPolicies, municipalCostRules, municipalCostSourceReductions, municipalCostSources } from "../../schema/finance-costs";
import type { MunicipalCostAllocation, MunicipalCostFilters, MunicipalCostMovement, MunicipalCostMovementWithAllocations, MunicipalCostObject, MunicipalCostObjectItem, MunicipalCostItem, MunicipalCostRule, MunicipalCostPolicy, MunicipalCostSource, MunicipalCostSourceWithHistory } from "@/lib/contracts/finance-costs";

export async function readCostReportMovement(db: DatabaseExecutor, id: string): Promise<(MunicipalCostMovement & { source: MunicipalCostSource; allocations: (MunicipalCostAllocation & { object: MunicipalCostObject; item: MunicipalCostItem })[] }) | null> {
  const [row] = await db.select({ movement: municipalCostMovements, source: municipalCostSources }).from(municipalCostMovements).innerJoin(municipalCostSources, eq(municipalCostSources.id, municipalCostMovements.sourceId)).where(eq(municipalCostMovements.id, id));
  if (!row) return null;
  const allocations = await db.select({ allocation: municipalCostAllocations, object: municipalCostObjects, item: municipalCostItems }).from(municipalCostAllocations)
    .innerJoin(municipalCostObjects, eq(municipalCostObjects.id, municipalCostAllocations.objectId)).innerJoin(municipalCostItems, eq(municipalCostItems.id, municipalCostAllocations.itemId)).where(eq(municipalCostAllocations.movementId, id));
  return { ...row.movement, source: row.source, allocations: allocations.map(({ allocation, object, item }) => ({ ...allocation, object, item })) };
}

export async function readCostAuthorizedUnits(db: DatabaseExecutor, governmentEntityId: string, allowedBudgetUnitIds?: string[]): Promise<{ budgetUnitId: string; budgetUnit: { name: string } }[]> {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId, budgetUnit: { name: planningBudgetUnitLabels.name } }).from(planningEntityUnits).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId))
    .where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), allowedBudgetUnitIds ? inArray(planningEntityUnits.budgetUnitId, allowedBudgetUnitIds) : undefined));
}

async function costMovementHistory(db: DatabaseExecutor, movements: MunicipalCostMovement[], itemId?: string): Promise<MunicipalCostMovementWithAllocations[]> {
  if (!movements.length) return [];
  const ids = movements.map(row => row.id);
  const [allocations, corrections] = await Promise.all([
    db.select().from(municipalCostAllocations).where(and(inArray(municipalCostAllocations.movementId, ids), itemId ? eq(municipalCostAllocations.itemId, itemId) : undefined)),
    db.select({ id: municipalCostMovements.id, referenceMovementId: municipalCostMovements.referenceMovementId }).from(municipalCostMovements).where(inArray(municipalCostMovements.referenceMovementId, ids)),
  ]);
  return movements.map(row => ({ ...row, allocations: allocations.filter(allocation => allocation.movementId === row.id), correction: corrections.find(correction => correction.referenceMovementId === row.id) ?? null }));
}

export async function readCostPriorCorrections(db: DatabaseExecutor, financialYearId: string, governmentEntityId: string, unitIds: string[], period: { gte: Date; lte: Date }, filters: MunicipalCostFilters) {
  const historical = and(ne(municipalCostSources.financialYearId, financialYearId), eq(financialYears.governmentEntityId, governmentEntityId), inArray(municipalCostSources.budgetUnitId, unitIds),
    filters.sourceType ? eq(municipalCostSources.sourceType, filters.sourceType) : undefined,
    filters.expenseFrom ? gte(municipalCostSources.expenseDate, filters.expenseFrom) : undefined,
    filters.expenseUntil ? lte(municipalCostSources.expenseDate, filters.expenseUntil) : undefined);
  const source = { financialYearId: municipalCostSources.financialYearId, sourceType: municipalCostSources.sourceType, sourceId: municipalCostSources.sourceId, expenseDate: municipalCostSources.expenseDate, budgetUnitId: municipalCostSources.budgetUnitId };
  const [reductions, movements] = await Promise.all([
    db.select({ reduction: municipalCostSourceReductions, source }).from(municipalCostSourceReductions).innerJoin(municipalCostSources, eq(municipalCostSources.id, municipalCostSourceReductions.sourceId)).innerJoin(financialYears, eq(financialYears.id, municipalCostSources.financialYearId))
      .where(and(historical, gte(municipalCostSourceReductions.date, period.gte), lte(municipalCostSourceReductions.date, period.lte))).orderBy(asc(municipalCostSourceReductions.date), asc(municipalCostSourceReductions.id)),
    db.select({ movement: municipalCostMovements, source }).from(municipalCostMovements).innerJoin(municipalCostSources, eq(municipalCostSources.id, municipalCostMovements.sourceId)).innerJoin(financialYears, eq(financialYears.id, municipalCostSources.financialYearId))
      .where(and(historical, inArray(municipalCostMovements.kind, ["REVERSAL", "RESTORATION"]), gte(municipalCostMovements.date, period.gte), lte(municipalCostMovements.date, period.lte))).orderBy(asc(municipalCostMovements.date), asc(municipalCostMovements.id)),
  ]);
  const history = await costMovementHistory(db, movements.map(row => row.movement), filters.itemId);
  return { priorReductions: reductions.map(({ reduction, source }) => ({ ...reduction, source })), priorMovements: history.map((movement, index) => ({ ...movement, source: movements[index].source })) };
}

export async function readCostOverviewRecords(db: DatabaseExecutor, financialYearId: string, governmentEntityId: string, unitIds: string[], filters: MunicipalCostFilters): Promise<{
  objects: (MunicipalCostObject & { links: MunicipalCostObjectItem[] })[]; items: MunicipalCostItem[]; rules: MunicipalCostRule[]; sources: MunicipalCostSourceWithHistory[]; policies: MunicipalCostPolicy[];
}> {
  const [objects, items, rules, sources, policies] = await Promise.all([
    db.select().from(municipalCostObjects).where(and(eq(municipalCostObjects.financialYearId, financialYearId), or(isNull(municipalCostObjects.budgetUnitId), inArray(municipalCostObjects.budgetUnitId, unitIds)))).orderBy(asc(municipalCostObjects.code)),
    db.select().from(municipalCostItems).where(eq(municipalCostItems.financialYearId, financialYearId)).orderBy(asc(municipalCostItems.identifier)),
    db.select().from(municipalCostRules).where(and(eq(municipalCostRules.financialYearId, financialYearId), inArray(municipalCostRules.budgetUnitId, unitIds))).orderBy(desc(municipalCostRules.priority), desc(municipalCostRules.createdAt)),
    db.select().from(municipalCostSources).where(and(eq(municipalCostSources.financialYearId, financialYearId), inArray(municipalCostSources.budgetUnitId, unitIds), filters.sourceType ? eq(municipalCostSources.sourceType, filters.sourceType) : undefined, filters.expenseFrom ? gte(municipalCostSources.expenseDate, filters.expenseFrom) : undefined, filters.expenseUntil ? lte(municipalCostSources.expenseDate, filters.expenseUntil) : undefined)).orderBy(desc(municipalCostSources.expenseDate), asc(municipalCostSources.id)),
    db.select().from(municipalCostPolicies).where(eq(municipalCostPolicies.governmentEntityId, governmentEntityId)).orderBy(desc(municipalCostPolicies.effectiveFrom), desc(municipalCostPolicies.createdAt), desc(municipalCostPolicies.id)),
  ]);
  const sourceIds = sources.map(row => row.id);
  const [links, reductions, movements] = await Promise.all([
    objects.length ? db.select().from(municipalCostObjectItems).where(inArray(municipalCostObjectItems.objectId, objects.map(row => row.id))) : [],
    sources.length ? db.select().from(municipalCostSourceReductions).where(inArray(municipalCostSourceReductions.sourceId, sourceIds)).orderBy(asc(municipalCostSourceReductions.date), asc(municipalCostSourceReductions.id)) : [],
    sources.length ? db.select().from(municipalCostMovements).where(inArray(municipalCostMovements.sourceId, sourceIds)).orderBy(asc(municipalCostMovements.date), asc(municipalCostMovements.id)) : [],
  ]);
  const history = await costMovementHistory(db, movements);
  return { objects: objects.map(object => ({ ...object, links: links.filter(link => link.objectId === object.id) })), items, rules, policies,
    sources: sources.map(source => ({ ...source, reductions: reductions.filter(row => row.sourceId === source.id), movements: history.filter(row => row.sourceId === source.id) })) };
}
