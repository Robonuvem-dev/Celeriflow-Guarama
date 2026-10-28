import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction as Tx } from "@/db/transaction";
import { warehouses } from "@/db/schema/assets-stock";
import { pharmacyRequests, pharmacyRequestItems, pharmacyRequestFulfillments, pharmacyRequestEvents, pharmacyStockTransfers, pharmacyStockTransferItems } from "@/db/schema/health-pharmacy";
import { pharmacyRecord } from "@/db/repositories/health-pharmacy/records";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";

export async function lockPharmacyRequestItem(tx: Tx, context: HealthPharmacyContext, itemId: string) {
  const identity = pharmacyRecord((await tx.select({ requestId: pharmacyRequestItems.requestId }).from(pharmacyRequestItems).where(eq(pharmacyRequestItems.id, itemId)).limit(1))[0]);
  await tx.execute(sql`SELECT id FROM "PharmacyRequest" WHERE id=${identity.requestId} FOR UPDATE`);
  const row = pharmacyRecord((await tx.select({ item: pharmacyRequestItems, request: pharmacyRequests, destinationWarehouse: warehouses }).from(pharmacyRequestItems).innerJoin(pharmacyRequests, eq(pharmacyRequests.id, pharmacyRequestItems.requestId)).innerJoin(warehouses, eq(warehouses.id, pharmacyRequests.destinationWarehouseId)).where(eq(pharmacyRequestItems.id, itemId)).limit(1))[0]);
  const item = { ...row.item, request: { ...row.request, destinationWarehouse: row.destinationWarehouse } };
  if (!item.request.destinationWarehouse.healthUnitId) throw new Error("Pedido sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, item.request.destinationWarehouse.healthUnitId);
  return item;
}

export async function updateFulfilledQuantity(tx: Tx, context: HealthPharmacyContext, itemId: string, quantity: number) {
  const item = await lockPharmacyRequestItem(tx, context, itemId);
  const next = new Decimal(String(item.fulfilledQuantity)).plus(String(quantity));
  if (next.lt(0) || next.gt(String(item.requestedQuantity))) throw new Error("A quantidade atendida ultrapassa o saldo do pedido farmacêutico.");
  await tx.update(pharmacyRequestItems).set({ fulfilledQuantity: next.toNumber() }).where(eq(pharmacyRequestItems.id, item.id));
  const items = await tx.select({ requestedQuantity: pharmacyRequestItems.requestedQuantity, fulfilledQuantity: pharmacyRequestItems.fulfilledQuantity }).from(pharmacyRequestItems).where(eq(pharmacyRequestItems.requestId, item.requestId));
  const status = item.request.status === "CANCELLED" ? "CANCELLED" : items.every(row => row.fulfilledQuantity >= row.requestedQuantity) ? "FULFILLED" : items.some(row => row.fulfilledQuantity > 0) ? "PARTIAL" : "OPEN";
  await tx.update(pharmacyRequests).set({ status, fulfilledAt: status === "FULFILLED" ? new Date() : null }).where(eq(pharmacyRequests.id, item.requestId));
  return item.requestId;
}

export async function assertPatientPharmacyRequest(tx: Tx, context: HealthPharmacyContext, input: { itemId: string; patientId: string; warehouseId: string; materialId: string; quantity: number }) {
  const item = await lockPharmacyRequestItem(tx, context, input.itemId);
  if (item.request.status === "CANCELLED" || item.request.patientId !== input.patientId || item.request.destinationWarehouseId !== input.warehouseId || item.materialId !== input.materialId) throw new Error("Pedido, paciente, produto ou estoque incompatível com a demanda reprimida.");
  if (new Decimal(String(item.fulfilledQuantity)).plus(String(input.quantity)).gt(String(item.requestedQuantity))) throw new Error("A entrega ultrapassa a quantidade pendente da demanda reprimida.");
}

export async function recordPharmacyRequestFulfillment(tx: Tx, context: HealthPharmacyContext, input: { itemId: string; quantity: number; movementId: string; dispensationId?: string; transferItemId?: string; receiverPersonId?: string | null; reason: string }) {
  const requestId = await updateFulfilledQuantity(tx, context, input.itemId, input.quantity);
  await tx.insert(pharmacyRequestFulfillments).values({ requestItemId: input.itemId, quantity: input.quantity, movementId: input.movementId, dispensationId: input.dispensationId, transferItemId: input.transferItemId, receiverPersonId: input.receiverPersonId, reason: input.reason, actorUsuarioId: context.user.id });
  const request = pharmacyRecord((await tx.select({ status: pharmacyRequests.status }).from(pharmacyRequests).where(eq(pharmacyRequests.id, requestId)).limit(1))[0]);
  await tx.insert(pharmacyRequestEvents).values({ requestId, status: request.status, reason: input.reason, actorUsuarioId: context.user.id });
}

export async function lockDispensationPharmacyRequest(tx: Tx, context: HealthPharmacyContext, dispensationId: string) {
  const fulfillment = (await tx.select().from(pharmacyRequestFulfillments).where(eq(pharmacyRequestFulfillments.dispensationId, dispensationId)).limit(1))[0] ?? null;
  if (fulfillment) await lockPharmacyRequestItem(tx, context, fulfillment.requestItemId);
  return fulfillment;
}

export async function cancelDispensationPharmacyRequest(tx: Tx, context: HealthPharmacyContext, dispensationId: string, reason: string) {
  const fulfillment = await lockDispensationPharmacyRequest(tx, context, dispensationId);
  if (!fulfillment || fulfillment.status === "CANCELLED") return;
  const requestId = await updateFulfilledQuantity(tx, context, fulfillment.requestItemId, -fulfillment.quantity);
  await tx.update(pharmacyRequestFulfillments).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(pharmacyRequestFulfillments.id, fulfillment.id));
  const request = pharmacyRecord((await tx.select({ status: pharmacyRequests.status }).from(pharmacyRequests).where(eq(pharmacyRequests.id, requestId)).limit(1))[0]);
  await tx.insert(pharmacyRequestEvents).values({ requestId, status: request.status, reason: `Recomposição da demanda: ${reason}`, actorUsuarioId: context.user.id });
}

export async function assertPharmacyRequestTransfer(tx: Tx, context: HealthPharmacyContext, input: { itemId: string; originWarehouseId: string; destinationWarehouseId: string; materialId: string; quantity: number }) {
  const item = await lockPharmacyRequestItem(tx, context, input.itemId);
  if (item.request.patientId || item.request.status === "CANCELLED" || item.materialId !== input.materialId || item.request.destinationWarehouseId !== input.destinationWarehouseId || item.request.originWarehouseId && item.request.originWarehouseId !== input.originWarehouseId) throw new Error("Requisição entre unidades incompatível com a transferência selecionada.");
  // The physical aggregate is float8, as in the original transfer writer.
  const [inTransit] = await tx.select({ quantity: sql<number>`coalesce(sum(${pharmacyStockTransferItems.quantity}), 0)::double precision`.mapWith(Number) }).from(pharmacyStockTransferItems).innerJoin(pharmacyStockTransfers, eq(pharmacyStockTransfers.id, pharmacyStockTransferItems.transferId)).where(and(eq(pharmacyStockTransferItems.pharmacyRequestItemId, item.id), eq(pharmacyStockTransfers.status, "IN_TRANSIT")));
  if (new Decimal(String(item.fulfilledQuantity)).plus(String(inTransit.quantity)).plus(String(input.quantity)).gt(String(item.requestedQuantity))) throw new Error("Quantidade enviada/recebida ultrapassa o saldo da requisição.");
}
