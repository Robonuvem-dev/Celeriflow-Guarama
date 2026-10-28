import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { Decimal } from "../../decimal";
import { financialYears } from "../../schema/finance-years";
import { municipalCostAllocations, municipalCostItems, municipalCostMovements, municipalCostObjectItems, municipalCostObjects, municipalCostPolicies, municipalCostRules, municipalCostSourceReductions, municipalCostSources } from "../../schema/finance-costs";
import type { MunicipalCostAllocation, MunicipalCostMovement, MunicipalCostPolicy, MunicipalCostReduction, MunicipalCostRule, MunicipalCostSource } from "@/lib/contracts/finance-costs";

export async function findCostRecognitionYear(db: DatabaseExecutor, governmentEntityId: string, year: number) {
  const [row] = await db.select().from(financialYears).where(and(eq(financialYears.governmentEntityId, governmentEntityId), eq(financialYears.year, year)));
  return row ?? null;
}
export async function findCostPolicy(db: DatabaseExecutor, governmentEntityId: string, date: Date): Promise<MunicipalCostPolicy | null> {
  const [row] = await db.select().from(municipalCostPolicies).where(and(eq(municipalCostPolicies.governmentEntityId, governmentEntityId), lte(municipalCostPolicies.effectiveFrom, date))).orderBy(desc(municipalCostPolicies.effectiveFrom), desc(municipalCostPolicies.createdAt), desc(municipalCostPolicies.id)).limit(1);
  return row ?? null;
}
export async function findCostSource(db: DatabaseExecutor, id: string): Promise<MunicipalCostSource | null> {
  const [row] = await db.select().from(municipalCostSources).where(eq(municipalCostSources.id, id));
  return row ?? null;
}
export async function findCostSourceByOrigin(db: DatabaseExecutor, sourceType: string, sourceId: string): Promise<MunicipalCostSource | null> {
  const [row] = await db.select().from(municipalCostSources).where(and(eq(municipalCostSources.sourceType, sourceType), eq(municipalCostSources.sourceId, sourceId)));
  return row ?? null;
}
export async function findCostReductionReplay(db: DatabaseExecutor, key: string): Promise<MunicipalCostReduction | null> {
  const [row] = await db.select().from(municipalCostSourceReductions).where(eq(municipalCostSourceReductions.idempotencyKey, key));
  return row ?? null;
}
export async function findCostMovementReplay(db: DatabaseExecutor, key: string): Promise<MunicipalCostMovement | null> {
  const [row] = await db.select().from(municipalCostMovements).where(eq(municipalCostMovements.idempotencyKey, key));
  return row ?? null;
}
export async function readCostPairDefinitions(db: DatabaseExecutor, pairs: Array<{ objectId: string; itemId: string }>) {
  if (!pairs.length) return [];
  const rows = await db.select({ link: municipalCostObjectItems, object: municipalCostObjects, item: municipalCostItems }).from(municipalCostObjectItems).innerJoin(municipalCostObjects, eq(municipalCostObjects.id, municipalCostObjectItems.objectId)).innerJoin(municipalCostItems, eq(municipalCostItems.id, municipalCostObjectItems.itemId))
    .where(or(...pairs.map(pair => and(eq(municipalCostObjectItems.objectId, pair.objectId), eq(municipalCostObjectItems.itemId, pair.itemId)))));
  return rows.map(({ link, object, item }) => ({ ...link, object, item }));
}
export async function readCostPosition(db: DatabaseExecutor, sourceId: string): Promise<Decimal> {
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${municipalCostAllocations.amount}),0)::text` }).from(municipalCostAllocations).innerJoin(municipalCostMovements, eq(municipalCostMovements.id, municipalCostAllocations.movementId)).where(eq(municipalCostMovements.sourceId, sourceId));
  return new Decimal(row.total);
}
export async function readCostReductions(db: DatabaseExecutor, sourceId: string): Promise<Decimal> {
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${municipalCostSourceReductions.amount}),0)::text` }).from(municipalCostSourceReductions).where(eq(municipalCostSourceReductions.sourceId, sourceId));
  return new Decimal(row.total);
}
export async function insertCostPolicy(tx: DatabaseTransaction, input: typeof municipalCostPolicies.$inferInsert): Promise<MunicipalCostPolicy> {
  const [row] = await tx.insert(municipalCostPolicies).values(input).returning();
  return row;
}
export async function insertCostReduction(tx: DatabaseTransaction, input: typeof municipalCostSourceReductions.$inferInsert): Promise<MunicipalCostReduction> {
  const [row] = await tx.insert(municipalCostSourceReductions).values(input).returning();
  return row;
}
export async function insertCostMovement(tx: DatabaseTransaction, input: typeof municipalCostMovements.$inferInsert, allocations: Array<Pick<MunicipalCostAllocation, "objectId" | "itemId" | "amount">>): Promise<MunicipalCostMovement> {
  const [row] = await tx.insert(municipalCostMovements).values(input).returning();
  await tx.insert(municipalCostAllocations).values(allocations.map(allocation => ({ ...allocation, movementId: row.id })));
  return row;
}
export async function readCostMovementOrigin(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ movement: municipalCostMovements, source: municipalCostSources }).from(municipalCostMovements).innerJoin(municipalCostSources, eq(municipalCostSources.id, municipalCostMovements.sourceId)).where(eq(municipalCostMovements.id, id));
  if (!row) return null;
  const allocations = await db.select().from(municipalCostAllocations).where(eq(municipalCostAllocations.movementId, id));
  return { ...row.movement, source: row.source, allocations };
}
export async function hasCostCorrection(db: DatabaseExecutor, id: string): Promise<boolean> {
  const [row] = await db.select({ id: municipalCostMovements.id }).from(municipalCostMovements).where(eq(municipalCostMovements.referenceMovementId, id)).limit(1);
  return !!row;
}
export async function findCostRule(db: DatabaseExecutor, id: string): Promise<MunicipalCostRule | null> {
  const [row] = await db.select().from(municipalCostRules).where(eq(municipalCostRules.id, id));
  return row ?? null;
}
export async function listApplicableCostRules(db: DatabaseExecutor, financialYearId: string, budgetUnitId: string, sourceType: string, date: Date): Promise<MunicipalCostRule[]> {
  return db.select().from(municipalCostRules).where(and(eq(municipalCostRules.financialYearId, financialYearId), eq(municipalCostRules.budgetUnitId, budgetUnitId), eq(municipalCostRules.sourceType, sourceType), eq(municipalCostRules.isActive, true), lte(municipalCostRules.effectiveFrom, date), or(isNull(municipalCostRules.effectiveUntil), gte(municipalCostRules.effectiveUntil, date)))).orderBy(desc(municipalCostRules.priority), asc(municipalCostRules.id));
}
export async function insertCostSource(tx: DatabaseTransaction, input: typeof municipalCostSources.$inferInsert): Promise<MunicipalCostSource> {
  const [row] = await tx.insert(municipalCostSources).values(input).returning();
  return row;
}
export async function cancelCostSource(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.update(municipalCostSources).set({ status: "CANCELLED" }).where(eq(municipalCostSources.id, id));
}
