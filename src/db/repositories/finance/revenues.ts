import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { revenues, revenueRedistributions, revenueReversals, taxRevenueIntegrations } from "../../schema/finance-revenues";
import { reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { Decimal } from "../../decimal";
import { PersistenceError } from "../../errors";

export async function findFinanceRevenue(db: DatabaseExecutor, filter: { id: string } | { idempotencyKey: string }) {
  const [row] = await db.select().from(revenues).where("id" in filter ? eq(revenues.id, filter.id) : eq(revenues.idempotencyKey, filter.idempotencyKey));
  return row ?? null;
}
export async function readFinanceRevenueExecution(db: DatabaseExecutor, filter: { id: string } | { idempotencyKey: string }) {
  const row = await findFinanceRevenue(db, filter);
  if (!row) return null;
  const [movements, integrations, reversals, redistributions] = await Promise.all([
    db.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.revenueId, row.id)),
    db.select().from(taxRevenueIntegrations).where(eq(taxRevenueIntegrations.revenueId, row.id)),
    db.select().from(revenueReversals).where(eq(revenueReversals.revenueId, row.id)),
    db.select({ id: revenueRedistributions.id }).from(revenueRedistributions).where(eq(revenueRedistributions.revenueId, row.id)),
  ]);
  return { ...row, treasuryMovement: movements[0] ?? null, taxIntegration: integrations[0] ?? null, reversal: reversals[0] ?? null, resourceRedistributions: redistributions };
}
export async function insertFinanceRevenue(tx: DatabaseTransaction, input: typeof revenues.$inferInsert) {
  const [row] = await tx.insert(revenues).values(input).returning();
  return row;
}
export async function updateFinanceRevenue(tx: DatabaseTransaction, id: string, input: Partial<typeof revenues.$inferInsert>) {
  const [row] = await tx.update(revenues).set(input).where(eq(revenues.id, id)).returning();
  if (!row) throw new PersistenceError("not-found", "Receita não encontrada.");
  return row;
}
export async function insertRevenueReversal(tx: DatabaseTransaction, input: typeof revenueReversals.$inferInsert) {
  const [row] = await tx.insert(revenueReversals).values(input).returning();
  return row;
}
export async function findRevenueRedistribution(db: DatabaseExecutor, key: string) {
  const [row] = await db.select().from(revenueRedistributions).where(eq(revenueRedistributions.idempotencyKey, key));
  return row ?? null;
}
export async function sumRevenueRedistributions(db: DatabaseExecutor, revenueId: string) {
  const [row] = (await db.execute<{ value: string | null }>(sql`SELECT sum("valueDecimal")::text AS value FROM "RevenueResourceRedistribution" WHERE "revenueId"=${revenueId}`)).rows;
  return row?.value === null || row?.value === undefined ? new Decimal(0) : new Decimal(row.value);
}
export async function insertRevenueRedistribution(tx: DatabaseTransaction, input: typeof revenueRedistributions.$inferInsert) {
  const [row] = await tx.insert(revenueRedistributions).values(input).returning();
  return row;
}
export async function listBankSourceRedistributions(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string, start: Date, end: Date) {
  return db.select({ sourceResourceSourceId: revenueRedistributions.sourceResourceSourceId, valueDecimal: revenueRedistributions.valueDecimal }).from(revenueRedistributions).innerJoin(revenues, eq(revenues.id, revenueRedistributions.revenueId)).where(and(eq(revenues.bankAccountId, bankAccountId), gte(revenueRedistributions.date, start), lte(revenueRedistributions.date, end), or(eq(revenueRedistributions.sourceResourceSourceId, resourceSourceId), eq(revenueRedistributions.destinationResourceSourceId, resourceSourceId))));
}
export async function listCollectedAllowanceRevenues(db: DatabaseExecutor, kind: "DIARIA" | "ADIANTAMENTO", requestId: string) {
  return db.select({ valueDecimal: revenues.valueDecimal }).from(revenues).where(and(eq(revenues.sourceModule, "RH"), eq(revenues.sourceType, kind === "DIARIA" ? "TRAVEL_ALLOWANCE_REFUND" : "ADVANCE_ALLOWANCE_REFUND"), eq(revenues.sourceId, requestId), eq(revenues.stage, "ARRECADADA"), isNull(revenues.reversedAt)));
}
export async function findRevenueRegistry(db: DatabaseExecutor, kind: "RevenueNature" | "ResourceSource", id: string) {
  const [row] = (await db.execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(kind)} WHERE id=${id}`)).rows;
  return row ?? null;
}
