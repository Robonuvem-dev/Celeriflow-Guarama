import { and, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { procurementContracts, purchaseProcessItems, purchaseProcesses } from "@/db/schema/procurement-core";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations, purchaseProcessItemOrigins, purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";
import { procurementCommitments, procurementReservations, procurementSettlements, procurementSettlementRetentions } from "@/db/schema/procurement-finance";
import { suppliers } from "@/db/schema/registry";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type AuthorizationRequestItem = Row<typeof purchaseRequestItems> & { budgetAllocations: Row<typeof purchaseRequestBudgetAllocations>[] };
type ContractAuthorizationOrigin = Row<typeof procurementContracts> & {
  supplier: { status: string };
  process: Row<typeof purchaseProcesses> & {
    purchaseRequest: (Row<typeof purchaseRequests> & { items: AuthorizationRequestItem[] }) | null;
    items: (Row<typeof purchaseProcessItems> & { requestItemOrigins: (Row<typeof purchaseProcessItemOrigins> & { purchaseRequestItem: AuthorizationRequestItem })[] })[];
  };
};
type ReceiptAuthorizationOrigin = Row<typeof purchaseReceipts> & { items: Row<typeof purchaseReceiptItems>[] };
type AuthorizationReservation = Row<typeof procurementReservations> & { commitment: Row<typeof procurementCommitments> | null };
type AuthorizationSettlement = Row<typeof procurementSettlements> & { retentions: Row<typeof procurementSettlementRetentions>[] };

export async function loadContractAuthorizationOrigin(db: DatabaseExecutor, id: string): Promise<ContractAuthorizationOrigin | null> {
  const [row] = await db.select({ contract: procurementContracts, supplier: { status: suppliers.status }, process: purchaseProcesses }).from(procurementContracts).innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId)).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId)).where(eq(procurementContracts.id, id)).limit(1);
  if (!row) return null;
  const processItems = await db.select().from(purchaseProcessItems).where(eq(purchaseProcessItems.purchaseProcessId, row.process.id));
  const origins = processItems.length ? await db.select().from(purchaseProcessItemOrigins).where(inArray(purchaseProcessItemOrigins.purchaseProcessItemId, processItems.map(item => item.id))) : [];
  const [legacyRequest] = row.process.purchaseRequestId ? await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, row.process.purchaseRequestId)).limit(1) : [];
  const legacyItems = legacyRequest ? await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, legacyRequest.id)) : [];
  const requestItemIds = [...new Set([...origins.map(origin => origin.purchaseRequestItemId), ...legacyItems.map(item => item.id)])];
  const requestItems = requestItemIds.length ? await db.select().from(purchaseRequestItems).where(inArray(purchaseRequestItems.id, requestItemIds)) : [];
  const allocations = requestItemIds.length ? await db.select().from(purchaseRequestBudgetAllocations).where(inArray(purchaseRequestBudgetAllocations.purchaseRequestItemId, requestItemIds)) : [];
  const sourceItems = requestItems.map(item => ({ ...item, budgetAllocations: allocations.filter(allocation => allocation.purchaseRequestItemId === item.id) }));
  return { ...row.contract, supplier: row.supplier, process: { ...row.process,
    purchaseRequest: legacyRequest ? { ...legacyRequest, items: sourceItems.filter(item => item.purchaseRequestId === legacyRequest.id) } : null,
    items: processItems.map(item => ({ ...item, requestItemOrigins: origins.filter(origin => origin.purchaseProcessItemId === item.id).map(origin => { const source = sourceItems.find(source => source.id === origin.purchaseRequestItemId); if (!source) throw new Error("Item de origem não encontrado."); return { ...origin, purchaseRequestItem: source }; }) })),
  } };
}

export async function loadReceiptAuthorizationOrigin(db: DatabaseExecutor, id: string): Promise<ReceiptAuthorizationOrigin | null> {
  const [receipt] = await db.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, id)).limit(1);
  return receipt ? { ...receipt, items: await db.select().from(purchaseReceiptItems).where(eq(purchaseReceiptItems.purchaseReceiptId, id)) } : null;
}

export async function loadAuthorizationReservation(db: DatabaseExecutor, input: { id?: string; expenseId: string }): Promise<AuthorizationReservation | null> {
  const [reservation] = await db.select().from(procurementReservations).where(input.id ? eq(procurementReservations.id, input.id) : and(eq(procurementReservations.expenseId, input.expenseId), inArray(procurementReservations.status, ["Ativa", "Empenhada"]))).orderBy(desc(procurementReservations.createdAt)).limit(1);
  if (!reservation) return null;
  const [commitment] = await db.select().from(procurementCommitments).where(eq(procurementCommitments.reservationId, reservation.id)).limit(1);
  return { ...reservation, commitment: commitment ?? null };
}

export async function loadAuthorizationSettlement(db: DatabaseExecutor, input: { commitmentId: string; documentId: string; documentRef: string }): Promise<AuthorizationSettlement | null> {
  const [settlement] = await db.select().from(procurementSettlements).where(and(eq(procurementSettlements.commitmentId, input.commitmentId), eq(procurementSettlements.documentId, input.documentId), eq(procurementSettlements.documentRef, input.documentRef))).limit(1);
  return settlement ? { ...settlement, retentions: await db.select().from(procurementSettlementRetentions).where(eq(procurementSettlementRetentions.settlementId, settlement.id)) } : null;
}
