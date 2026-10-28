import { and, eq, like, sql } from "drizzle-orm";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor } from "../../transaction";
import { integrationConnections } from "../../schema/integrations";
import { healthUnits } from "../../schema/health-workforce";
import { healthFollowupBatches, healthFollowupBatchItems, healthFollowupBindings, healthFollowupReceipts, healthFollowupReceivers, healthFollowupResults } from "../../schema/health-followup";

export function followupRow<T>(row: T | undefined): T {
  if (!row) throw new PersistenceError("not-found", "Registro de acompanhamento não encontrado.");
  return row;
}
export async function readFollowupBinding(db: DatabaseExecutor, bindingId: string) {
  const row = followupRow((await db.select({ binding: healthFollowupBindings, connection: integrationConnections, receiver: healthFollowupReceivers, unit: { name: healthUnits.name } }).from(healthFollowupBindings)
    .innerJoin(integrationConnections, eq(integrationConnections.id, healthFollowupBindings.connectionId)).innerJoin(healthFollowupReceivers, eq(healthFollowupReceivers.id, healthFollowupBindings.receiverId)).innerJoin(healthUnits, eq(healthUnits.id, healthFollowupBindings.unitId))
    .where(eq(healthFollowupBindings.id, bindingId)).limit(1))[0]);
  return { ...row.binding, connection: row.connection, receiver: row.receiver, unit: row.unit };
}
export async function readFollowupBatch(db: DatabaseExecutor, batchId: string) {
  const batch = followupRow((await db.select().from(healthFollowupBatches).where(eq(healthFollowupBatches.id, batchId)).limit(1))[0]);
  const [binding, items, receiptRows] = await Promise.all([
    readFollowupBinding(db, batch.bindingId),
    db.select().from(healthFollowupBatchItems).where(eq(healthFollowupBatchItems.batchId, batch.id)).orderBy(healthFollowupBatchItems.ordinal),
    db.select().from(healthFollowupReceipts).where(eq(healthFollowupReceipts.batchId, batch.id)).limit(1),
  ]);
  const receipt = receiptRows[0];
  const results = receipt ? await db.select({ result: healthFollowupResults, batchItem: { ordinal: healthFollowupBatchItems.ordinal, originType: healthFollowupBatchItems.originType, originId: healthFollowupBatchItems.originId } }).from(healthFollowupResults)
    .innerJoin(healthFollowupBatchItems, eq(healthFollowupBatchItems.id, healthFollowupResults.batchItemId)).where(eq(healthFollowupResults.receiptId, receipt.id)).orderBy(healthFollowupBatchItems.ordinal) : [];
  const { unit, ...batchBinding } = binding;
  void unit;
  return { ...batch, binding: batchBinding, items, receipt: receipt ? { ...receipt, results: results.map(row => ({ ...row.result, batchItem: row.batchItem })) } : null };
}
export async function readFollowupGeneration(db: DatabaseExecutor, bindingId: string, requestKey: string) {
  // A typed subquery keeps the outer column qualified. Interpolating its columns
  // directly in the single-table selection would let Drizzle strip qualifiers.
  const itemCount = db.select({ total: sql<number>`count(*)::int` }).from(healthFollowupBatchItems)
    .where(eq(healthFollowupBatchItems.batchId, healthFollowupBatches.id));
  return db.select({ id: healthFollowupBatches.id, fromDate: healthFollowupBatches.fromDate, toDate: healthFollowupBatches.toDate, reprocessOfId: healthFollowupBatches.reprocessOfId, onlyRejected: healthFollowupBatches.onlyRejected,
    items: sql<number>`(${itemCount})` }).from(healthFollowupBatches)
    .where(and(eq(healthFollowupBatches.bindingId, bindingId), like(healthFollowupBatches.idempotencyKey, `${requestKey}:%`))).orderBy(healthFollowupBatches.idempotencyKey);
}
