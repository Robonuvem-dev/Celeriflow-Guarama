import { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
type Tx = Prisma.TransactionClient;
export async function lockPharmacyRequestItem(tx: Tx, context: AppContext, itemId: string) {
  const identity = await tx.pharmacyRequestItem.findUniqueOrThrow({ where: { id: itemId }, select: { requestId: true } });
  await tx.$queryRaw`SELECT id FROM "PharmacyRequest" WHERE id=${identity.requestId} FOR UPDATE`;
  const item = await tx.pharmacyRequestItem.findUniqueOrThrow({ where: { id: itemId }, include: { request: { include: { destinationWarehouse: true } } } });
  if (!item.request.destinationWarehouse.healthUnitId) throw new Error("Pedido sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, item.request.destinationWarehouse.healthUnitId);
  return item;
}

export async function updateFulfilledQuantity(tx: Tx, context: AppContext, itemId: string, quantity: number) {
  const item = await lockPharmacyRequestItem(tx, context, itemId);
  const next = new Prisma.Decimal(String(item.fulfilledQuantity)).plus(String(quantity));
  if (next.lt(0) || next.gt(String(item.requestedQuantity))) throw new Error("A quantidade atendida ultrapassa o saldo do pedido farmacêutico.");
  await tx.pharmacyRequestItem.update({ where: { id: item.id }, data: { fulfilledQuantity: next.toNumber() } });
  const items = await tx.pharmacyRequestItem.findMany({ where: { requestId: item.requestId }, select: { requestedQuantity: true, fulfilledQuantity: true } });
  const status = item.request.status === "CANCELLED" ? "CANCELLED" : items.every(row => row.fulfilledQuantity >= row.requestedQuantity) ? "FULFILLED" : items.some(row => row.fulfilledQuantity > 0) ? "PARTIAL" : "OPEN";
  await tx.pharmacyRequest.update({ where: { id: item.requestId }, data: { status, fulfilledAt: status === "FULFILLED" ? new Date() : null } });
  return item.requestId;
}

export async function assertPatientPharmacyRequest(tx: Tx, context: AppContext, input: { itemId: string; patientId: string; warehouseId: string; materialId: string; quantity: number }) {
  const item = await lockPharmacyRequestItem(tx, context, input.itemId);
  if (item.request.status === "CANCELLED" || item.request.patientId !== input.patientId || item.request.destinationWarehouseId !== input.warehouseId || item.materialId !== input.materialId) throw new Error("Pedido, paciente, produto ou estoque incompatível com a demanda reprimida.");
  if (new Prisma.Decimal(String(item.fulfilledQuantity)).plus(String(input.quantity)).gt(String(item.requestedQuantity))) throw new Error("A entrega ultrapassa a quantidade pendente da demanda reprimida.");
}

export async function recordPharmacyRequestFulfillment(tx: Tx, context: AppContext, input: { itemId: string; quantity: number; movementId: string; dispensationId?: string; transferItemId?: string; receiverPersonId?: string | null; reason: string }) {
  const requestId = await updateFulfilledQuantity(tx, context, input.itemId, input.quantity);
  await tx.pharmacyRequestFulfillment.create({ data: { requestItemId: input.itemId, quantity: input.quantity, movementId: input.movementId, dispensationId: input.dispensationId, transferItemId: input.transferItemId, receiverPersonId: input.receiverPersonId, reason: input.reason, actorUsuarioId: context.user.id } });
  const request = await tx.pharmacyRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
  await tx.pharmacyRequestEvent.create({ data: { requestId, status: request.status, reason: input.reason, actorUsuarioId: context.user.id } });
}

export async function lockDispensationPharmacyRequest(tx: Tx, context: AppContext, dispensationId: string) {
  const fulfillment = await tx.pharmacyRequestFulfillment.findUnique({ where: { dispensationId } });
  if (fulfillment) await lockPharmacyRequestItem(tx, context, fulfillment.requestItemId);
  return fulfillment;
}

export async function cancelDispensationPharmacyRequest(tx: Tx, context: AppContext, dispensationId: string, reason: string) {
  const fulfillment = await lockDispensationPharmacyRequest(tx, context, dispensationId);
  if (!fulfillment || fulfillment.status === "CANCELLED") return;
  const requestId = await updateFulfilledQuantity(tx, context, fulfillment.requestItemId, -fulfillment.quantity);
  await tx.pharmacyRequestFulfillment.update({ where: { id: fulfillment.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const request = await tx.pharmacyRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
  await tx.pharmacyRequestEvent.create({ data: { requestId, status: request.status, reason: `Recomposição da demanda: ${reason}`, actorUsuarioId: context.user.id } });
}

export async function assertPharmacyRequestTransfer(tx: Tx, context: AppContext, input: { itemId: string; originWarehouseId: string; destinationWarehouseId: string; materialId: string; quantity: number }) {
  const item = await lockPharmacyRequestItem(tx, context, input.itemId);
  if (item.request.patientId || item.request.status === "CANCELLED" || item.materialId !== input.materialId || item.request.destinationWarehouseId !== input.destinationWarehouseId || item.request.originWarehouseId && item.request.originWarehouseId !== input.originWarehouseId) throw new Error("Requisição entre unidades incompatível com a transferência selecionada.");
  const inTransit = await tx.healthStockTransferItem.aggregate({ where: { pharmacyRequestItemId: item.id, transfer: { status: "IN_TRANSIT" } }, _sum: { quantity: true } });
  if (new Prisma.Decimal(String(item.fulfilledQuantity)).plus(String(inTransit._sum.quantity || 0)).plus(String(input.quantity)).gt(String(item.requestedQuantity))) throw new Error("Quantidade enviada/recebida ultrapassa o saldo da requisição.");
}
