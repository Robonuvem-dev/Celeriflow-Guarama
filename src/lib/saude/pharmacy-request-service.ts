import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { applyStockMovement, reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";
import { manualDispensationTx, pharmacyDispensationAccess, prescriptionDispensationTx } from "./pharmacy-dispensation-service";
import { assertPatientPharmacyRequest, lockPharmacyRequestItem, recordPharmacyRequestFulfillment, updateFulfilledQuantity } from "./pharmacy-request-policy";

export async function createPharmacyStockRequest(context: AppContext, raw: unknown) {
  const input = z.object({ idempotencyKey: z.string().trim().min(8).max(180).nullable().default(null), patientId: z.string().nullable(), destinationWarehouseId: z.string().min(1), originWarehouseId: z.string().nullable().default(null), notes: z.string().trim().max(2000).nullable(), items: z.array(z.object({ materialId: z.string().min(1), quantity: z.number().positive() }).strict()).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.items.map(item => item.materialId)).size !== input.items.length) throw new Error("Não repita o produto no pedido.");
  return context.prisma.$transaction(async tx => {
    const destination = await tx.warehouse.findFirstOrThrow({ where: { id: input.destinationWarehouseId, isActive: true } });
    if (!destination.healthUnitId) throw new Error("Selecione estoque assistencial vinculado à saúde.");
    assertHealthUnitAccess(context.user, destination.healthUnitId);
    if (input.idempotencyKey) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_REQUEST:${input.idempotencyKey}`}))`;
      const previous = await tx.pharmacyRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (previous) {
        if (previous.patientId !== input.patientId || previous.destinationWarehouseId !== input.destinationWarehouseId || previous.originWarehouseId !== input.originWarehouseId || previous.notes !== input.notes || previous.items.length !== input.items.length || input.items.some(item => !previous.items.some(prior => prior.materialId === item.materialId && prior.requestedQuantity === item.quantity))) throw new Error("Pedido já registrado com outros dados.");
        return previous;
      }
    }
    if (input.patientId && !await tx.patient.count({ where: { id: input.patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } } })) throw new Error("Selecione paciente ativo para a demanda reprimida.");
    if (await tx.material.count({ where: { id: { in: input.items.map(item => item.materialId) }, isActive: true, healthProfile: { isActive: true } } }) !== input.items.length) throw new Error("Selecione produtos assistenciais ativos.");
    if (input.originWarehouseId) {
      if (input.originWarehouseId === destination.id) throw new Error("Origem e destino devem ser estoques diferentes.");
      const origin = await tx.warehouse.findFirstOrThrow({ where: { id: input.originWarehouseId, isActive: true } });
      if (!origin.healthUnitId) throw new Error("Estoque de origem sem unidade de saúde.");
      assertHealthUnitAccess(context.user, origin.healthUnitId);
      for (const item of input.items) if (!await tx.materialStock.count({ where: { warehouseId: origin.id, materialId: item.materialId, quantity: { gt: 0 }, blockedAt: null, OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }] } })) throw new Error("O estoque de origem não possui saldo válido para um dos produtos selecionados.");
    }
    return tx.pharmacyRequest.create({ data: { idempotencyKey: input.idempotencyKey, patientId: input.patientId, originWarehouseId: input.originWarehouseId, destinationWarehouseId: destination.id, notes: input.notes, createdByUsuarioId: context.user.id, items: { create: input.items.map(item => ({ materialId: item.materialId, requestedQuantity: item.quantity })) }, events: { create: { status: "OPEN", reason: input.patientId ? "Demanda reprimida registrada para o paciente" : "Requisição entre estoques registrada", actorUsuarioId: context.user.id } } } });
  });
}

export async function fulfillPatientPharmacyRequest(context: AppContext, raw: unknown) {
  const input = z.object({ itemId: z.string().min(1), stockId: z.string().min(1), quantity: z.number().positive(), prescriptionItemId: z.string().nullable(), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), prescriberProfessionalId: z.string().nullable(), dosage: z.string().trim().max(4000), receiverPersonId: z.string().nullable(), receiverRelationship: z.string().trim().max(200).nullable(), idempotencyKey: z.string().trim().min(8).max(180) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const stock = await tx.materialStock.findUniqueOrThrow({ where: { id: input.stockId }, include: { material: { include: { medicine: true, healthProfile: true } } } });
    await pharmacyDispensationAccess(tx, context, stock.warehouseId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_DEMAND:${input.idempotencyKey}`}))`;
    const previous = await tx.materialMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { pharmacyRequestFulfillment: true } });
    if (previous) {
      if (previous.pharmacyRequestFulfillment?.requestItemId !== input.itemId || previous.quantity !== input.quantity || previous.stockId !== input.stockId || previous.pharmacyRequestFulfillment.status !== "ACTIVE") throw new Error("Atendimento já registrado com outros dados ou cancelado.");
      return { fulfillmentId: previous.pharmacyRequestFulfillment.id };
    }
    const item = await tx.pharmacyRequestItem.findUniqueOrThrow({ where: { id: input.itemId }, include: { request: true } });
    if (!item.request.patientId) throw new Error("Use a transferência com aceite para uma requisição entre estoques.");
    if (item.materialId !== stock.materialId || item.request.destinationWarehouseId !== stock.warehouseId) throw new Error("O produto e estoque selecionados devem corresponder à demanda.");
    if (stock.material.medicine) {
      const shared = { pharmacyRequestItemId: item.id, warehouseId: stock.warehouseId, quantity: input.quantity, batchNumber: stock.batchNumber, receiverPersonId: input.receiverPersonId, receiverRelationship: input.receiverRelationship, idempotencyKey: input.idempotencyKey };
      if (!input.prescriptionItemId && !input.dosage) throw new Error("Informe a posologia da receita externa.");
      const dispensation = input.prescriptionItemId ? await prescriptionDispensationTx(tx, context, { ...shared, prescriptionItemId: input.prescriptionItemId }) : await manualDispensationTx(tx, context, { ...shared, patientId: item.request.patientId, medicineId: stock.material.medicine.id, prescriptionType: input.prescriptionType, prescriberProfessionalId: input.prescriberProfessionalId, dosage: input.dosage });
      const recorded = await tx.pharmacyRequestFulfillment.findUniqueOrThrow({ where: { dispensationId: dispensation.id } });
      return { fulfillmentId: recorded.id, dispensationId: dispensation.id };
    }
    await assertPatientPharmacyRequest(tx, context, { itemId: item.id, patientId: item.request.patientId, warehouseId: stock.warehouseId, materialId: stock.materialId, quantity: input.quantity });
    if (["MEDICINE", "CONTROLLED", "MANIPULATED"].includes(stock.material.healthProfile?.productKind || "")) throw new Error("Vincule o produto ao medicamento e à receita antes da entrega.");
    if (!stock.material.isActive || !stock.material.healthProfile?.isActive || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new Error("Produto ou lote indisponível para atendimento da demanda.");
    const patient = await tx.patient.findFirstOrThrow({ where: { id: item.request.patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } }, select: { personId: true } });
    const receiverPersonId = input.receiverPersonId || patient.personId;
    if (!await tx.person.count({ where: { id: receiverPersonId, status: "Ativo" } }) || receiverPersonId !== patient.personId && !input.receiverRelationship) throw new Error("Selecione retirante ativo e informe o vínculo com o paciente.");
    const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, idempotencyKey: input.idempotencyKey, reason: `DEMANDA_REPRIMIDA:${item.requestId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    await recordPharmacyRequestFulfillment(tx, context, { itemId: item.id, quantity: input.quantity, movementId: movement.id, receiverPersonId, reason: "Entrega do produto ao paciente" });
    const recorded = await tx.pharmacyRequestFulfillment.findUniqueOrThrow({ where: { movementId: movement.id } });
    return { fulfillmentId: recorded.id };
  });
}

export async function cancelPharmacyProductFulfillment(context: AppContext, raw: unknown) {
  const input = z.object({ fulfillmentId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PharmacyRequestFulfillment" WHERE id=${input.fulfillmentId} FOR UPDATE`;
    const fulfillment = await tx.pharmacyRequestFulfillment.findUniqueOrThrow({ where: { id: input.fulfillmentId }, include: { movement: true } });
    const item = await lockPharmacyRequestItem(tx, context, fulfillment.requestItemId);
    if (fulfillment.dispensationId || fulfillment.transferItemId) throw new Error("Utilize o registro de dispensação ou o documento de transferência da origem.");
    if (fulfillment.status === "CANCELLED") return { id: fulfillment.id };
    await pharmacyDispensationAccess(tx, context, fulfillment.movement.warehouseId);
    await reverseStockMovementInTransaction(tx, { movementId: fulfillment.movementId, reason: `RECOMPOSICAO_DEMANDA:${input.reason}`, idempotencyKey: `CANCEL_PHARMACY_FULFILLMENT:${fulfillment.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    await updateFulfilledQuantity(tx, context, item.id, -fulfillment.quantity);
    await tx.pharmacyRequestFulfillment.update({ where: { id: fulfillment.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const request = await tx.pharmacyRequest.findUniqueOrThrow({ where: { id: item.requestId }, select: { status: true } });
    await tx.pharmacyRequestEvent.create({ data: { requestId: item.requestId, status: request.status, reason: input.reason, actorUsuarioId: context.user.id } });
    return { id: fulfillment.id };
  });
}

export async function cancelPharmacyStockRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PharmacyRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.pharmacyRequest.findUniqueOrThrow({ where: { id: input.requestId }, include: { destinationWarehouse: true } });
    if (!request.destinationWarehouse.healthUnitId) throw new Error("Requisição não pertence à saúde.");
    assertHealthUnitAccess(context.user, request.destinationWarehouse.healthUnitId);
    if (request.status === "CANCELLED") return { id: request.id };
    if (await tx.healthStockTransferItem.count({ where: { pharmacyRequestItem: { requestId: request.id }, transfer: { status: "IN_TRANSIT" } } })) throw new Error("Conclua o aceite das remessas em trânsito antes de cancelar a requisição.");
    await tx.pharmacyRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", events: { create: { status: "CANCELLED", reason: input.reason, actorUsuarioId: context.user.id } } } });
    return { id: request.id };
  });
}
