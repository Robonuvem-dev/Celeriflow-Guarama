import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { retentionRules, settlementRetentions, settlements } from "../../schema/finance-settlements";
import { documents } from "../../schema/registry";
import { paymentRetentions, payments } from "../../schema/finance-payments";
import { findFinanceCommitment } from "./budget-execution";

export type SettlementRecord = typeof settlements.$inferSelect;
export async function findFinanceSettlement(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(settlements).where(eq(settlements.id, id));
  return row ?? null;
}
export async function readSettlementWithOrigin(db: DatabaseExecutor, id: string) {
  const row = await findFinanceSettlement(db, id);
  if (!row) return null;
  const commitment = await findFinanceCommitment(db, row.commitmentId);
  if (!commitment) throw new Error("Empenho da liquidação não encontrado.");
  return { ...row, commitment };
}
export async function findSettlementDocument(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}
export async function isSettlementAuthorActive(db: DatabaseExecutor, id: string): Promise<boolean> {
  const [row] = (await db.execute<{ isActive: boolean }>(sql`SELECT "isActive" FROM "Employee" WHERE id=${id}`)).rows;
  return row?.isActive ?? false;
}
export async function listActiveRetentionRules(db: DatabaseExecutor, criteria: { financialYearId: string; date: Date; serviceCode?: string; ruleIds: string[] }) {
  return db.select().from(retentionRules).where(and(eq(retentionRules.isActive, true), lte(retentionRules.effectiveFrom, criteria.date), or(isNull(retentionRules.effectiveTo), gte(retentionRules.effectiveTo, criteria.date)), or(isNull(retentionRules.financialYearId), eq(retentionRules.financialYearId, criteria.financialYearId)), criteria.serviceCode ? or(isNull(retentionRules.serviceCode), eq(retentionRules.serviceCode, criteria.serviceCode)) : isNull(retentionRules.serviceCode), criteria.ruleIds.length ? inArray(retentionRules.id, criteria.ruleIds) : undefined)).orderBy(asc(retentionRules.serviceCode), asc(retentionRules.code));
}
export async function insertFinanceSettlement(tx: DatabaseTransaction, input: typeof settlements.$inferInsert, retentions: Omit<typeof settlementRetentions.$inferInsert, "settlementId">[]): Promise<SettlementRecord> {
  const [row] = await tx.insert(settlements).values(input).returning();
  if (retentions.length) await tx.insert(settlementRetentions).values(retentions.map(retention => ({ ...retention, settlementId: row.id })));
  return row;
}
export async function setSettlementStatus(tx: DatabaseTransaction, id: string, status: string): Promise<SettlementRecord> {
  const [row] = await tx.update(settlements).set({ status }).where(eq(settlements.id, id)).returning();
  if (!row) throw new Error("Liquidação não encontrada.");
  return row;
}
export async function listPayableNativeSettlements(db: DatabaseExecutor, id: string) {
  return db.select().from(settlements).where(and(eq(settlements.payableCarryForwardId, id), eq(settlements.status, "Liquidado")));
}
export async function readSettlementPaymentBasis(db: DatabaseExecutor, id: string) {
  const row = await findFinanceSettlement(db, id);
  if (!row) return null;
  const retentions = await db.select().from(settlementRetentions).where(eq(settlementRetentions.settlementId, id));
  const allocations = retentions.length ? await db.select({ retention: paymentRetentions }).from(paymentRetentions).innerJoin(payments, eq(payments.id, paymentRetentions.paymentId)).where(and(inArray(paymentRetentions.settlementRetentionId, retentions.map(retention => retention.id)), inArray(payments.status, ["Emitida", "Paga"]))) : [];
  return { ...row, retentions: retentions.map(retention => ({ ...retention, paymentRetentions: allocations.filter(allocation => allocation.retention.settlementRetentionId === retention.id).map(allocation => allocation.retention) })) };
}
