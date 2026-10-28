import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { procurementLifecycleEvents, purchaseReceipts } from "../../schema/procurement-requests";
import { instrumentMeasurements } from "../../schema/procurement-instruments";

export async function hasFinanceProcurementEvent(db: DatabaseExecutor, eventType: string, entityType: string, entityId: string): Promise<boolean> {
  const [row] = await db.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(and(eq(procurementLifecycleEvents.eventType, eventType), eq(procurementLifecycleEvents.entityType, entityType), eq(procurementLifecycleEvents.entityId, entityId))).limit(1);
  return !!row;
}

export async function listFinanceSettlementOrigins(db: DatabaseExecutor, commitment: { contractId: string | null; covenantId: string | null }, documentId: string, cancellation: boolean) {
  const [receipts, measurements] = await Promise.all([
    commitment.contractId ? db.select({ id: purchaseReceipts.id }).from(purchaseReceipts).where(and(eq(purchaseReceipts.contractId, commitment.contractId), eq(purchaseReceipts.documentId, documentId), eq(purchaseReceipts.status, cancellation ? "CANCELLED" : "APPROVED"))).limit(2) : [],
    commitment.contractId || commitment.covenantId ? db.select({ id: instrumentMeasurements.id }).from(instrumentMeasurements).where(and(eq(instrumentMeasurements.documentId, documentId), eq(instrumentMeasurements.status, cancellation ? "Cancelada" : "Atestada"), commitment.contractId ? eq(instrumentMeasurements.contractId, commitment.contractId) : eq(instrumentMeasurements.covenantId, commitment.covenantId!))).limit(2) : [],
  ]);
  return { receipts, measurements };
}
