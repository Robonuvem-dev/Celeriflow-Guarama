import { z } from "zod";
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { materialMovements, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { pharmacyRequests, pharmacyRequestItems, pharmacyRequestEvents, pharmacyRequestFulfillments, pharmacyStockTransferItems, pharmacyStockTransfers } from "@/db/schema/health-pharmacy";
import { countActivePharmacyMaterials, isActivePharmacyPerson, pharmacyRecord, readActivePharmacyPatient, readPharmacyStock, readPharmacyWarehouse } from "@/db/repositories/health-pharmacy/records";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";
import { applyStockMovement, reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";
import { manualDispensationTx, pharmacyDispensationAccess, prescriptionDispensationTx } from "./pharmacy-dispensation-service";
import { assertPatientPharmacyRequest, lockPharmacyRequestItem, recordPharmacyRequestFulfillment, updateFulfilledQuantity } from "./pharmacy-request-policy";

export async function createPharmacyStockRequest(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ idempotencyKey: z.string().trim().min(8).max(180).nullable().default(null), patientId: z.string().nullable(), destinationWarehouseId: z.string().min(1), originWarehouseId: z.string().nullable().default(null), notes: z.string().trim().max(2000).nullable(), items: z.array(z.object({ materialId: z.string().min(1), quantity: z.number().positive() }).strict()).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.items.map(item => item.materialId)).size !== input.items.length) throw new Error("Não repita o produto no pedido.");
  return withDatabaseTransaction(connection, async tx => {
    const destination = await readPharmacyWarehouse(tx, input.destinationWarehouseId);
    if (!destination.healthUnitId) throw new Error("Selecione estoque assistencial vinculado à saúde.");
    assertHealthUnitAccess(context.user, destination.healthUnitId);
    if (input.idempotencyKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_REQUEST:${input.idempotencyKey}`}))`);
      const [header] = await tx.select().from(pharmacyRequests).where(eq(pharmacyRequests.idempotencyKey, input.idempotencyKey)).limit(1);
      const previous = header ? { ...header, items: await tx.select().from(pharmacyRequestItems).where(eq(pharmacyRequestItems.requestId, header.id)) } : null;
      if (previous) {
        if (previous.patientId !== input.patientId || previous.destinationWarehouseId !== input.destinationWarehouseId || previous.originWarehouseId !== input.originWarehouseId || previous.notes !== input.notes || previous.items.length !== input.items.length || input.items.some(item => !previous.items.some(prior => prior.materialId === item.materialId && prior.requestedQuantity === item.quantity))) throw new Error("Pedido já registrado com outros dados.");
        return previous;
      }
    }
    if (input.patientId) {
      try { await readActivePharmacyPatient(tx, input.patientId); } catch (error) {
        if (error instanceof Error && error.message === "Registro farmacêutico não encontrado.") throw new Error("Selecione paciente ativo para a demanda reprimida.");
        throw error;
      }
    }
    if (await countActivePharmacyMaterials(tx, input.items.map(item => item.materialId)) !== input.items.length) throw new Error("Selecione produtos assistenciais ativos.");
    if (input.originWarehouseId) {
      if (input.originWarehouseId === destination.id) throw new Error("Origem e destino devem ser estoques diferentes.");
      const origin = await readPharmacyWarehouse(tx, input.originWarehouseId);
      if (!origin.healthUnitId) throw new Error("Estoque de origem sem unidade de saúde.");
      assertHealthUnitAccess(context.user, origin.healthUnitId);
      for (const item of input.items) if (!(await tx.select({ id: materialStocks.id }).from(materialStocks).where(and(eq(materialStocks.warehouseId, origin.id), eq(materialStocks.materialId, item.materialId), gt(materialStocks.quantity, 0), isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date())))).limit(1))[0]) throw new Error("O estoque de origem não possui saldo válido para um dos produtos selecionados.");
    }
    const request = pharmacyRecord((await tx.insert(pharmacyRequests).values({ idempotencyKey: input.idempotencyKey, patientId: input.patientId, originWarehouseId: input.originWarehouseId, destinationWarehouseId: destination.id, notes: input.notes, createdByUsuarioId: context.user.id }).returning())[0]);
    await tx.insert(pharmacyRequestItems).values(input.items.map(item => ({ requestId: request.id, materialId: item.materialId, requestedQuantity: item.quantity })));
    await tx.insert(pharmacyRequestEvents).values({ requestId: request.id, status: "OPEN", reason: input.patientId ? "Demanda reprimida registrada para o paciente" : "Requisição entre estoques registrada", actorUsuarioId: context.user.id });
    return request;
  }, { timeoutMs: 5_000 });
}

export async function fulfillPatientPharmacyRequest(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ itemId: z.string().min(1), stockId: z.string().min(1), quantity: z.number().positive(), prescriptionItemId: z.string().nullable(), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), prescriberProfessionalId: z.string().nullable(), dosage: z.string().trim().max(4000), receiverPersonId: z.string().nullable(), receiverRelationship: z.string().trim().max(200).nullable(), idempotencyKey: z.string().trim().min(8).max(180) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const stock = await readPharmacyStock(tx, input.stockId);
    await pharmacyDispensationAccess(tx, context, stock.warehouseId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_DEMAND:${input.idempotencyKey}`}))`);
    const [prior] = await tx.select({ movement: materialMovements, pharmacyRequestFulfillment: pharmacyRequestFulfillments }).from(materialMovements).leftJoin(pharmacyRequestFulfillments, eq(pharmacyRequestFulfillments.movementId, materialMovements.id)).where(eq(materialMovements.idempotencyKey, input.idempotencyKey)).limit(1);
    const previous = prior ? { ...prior.movement, pharmacyRequestFulfillment: prior.pharmacyRequestFulfillment } : null;
    if (previous) {
      if (previous.pharmacyRequestFulfillment?.requestItemId !== input.itemId || previous.quantity !== input.quantity || previous.stockId !== input.stockId || previous.pharmacyRequestFulfillment.status !== "ACTIVE") throw new Error("Atendimento já registrado com outros dados ou cancelado.");
      return { fulfillmentId: previous.pharmacyRequestFulfillment.id };
    }
    const row = pharmacyRecord((await tx.select({ item: pharmacyRequestItems, request: pharmacyRequests }).from(pharmacyRequestItems).innerJoin(pharmacyRequests, eq(pharmacyRequests.id, pharmacyRequestItems.requestId)).where(eq(pharmacyRequestItems.id, input.itemId)).limit(1))[0]);
    const item = { ...row.item, request: row.request };
    if (!item.request.patientId) throw new Error("Use a transferência com aceite para uma requisição entre estoques.");
    if (item.materialId !== stock.materialId || item.request.destinationWarehouseId !== stock.warehouseId) throw new Error("O produto e estoque selecionados devem corresponder à demanda.");
    if (stock.material.medicine) {
      const shared = { pharmacyRequestItemId: item.id, warehouseId: stock.warehouseId, quantity: input.quantity, batchNumber: stock.batchNumber, receiverPersonId: input.receiverPersonId, receiverRelationship: input.receiverRelationship, idempotencyKey: input.idempotencyKey };
      if (!input.prescriptionItemId && !input.dosage) throw new Error("Informe a posologia da receita externa.");
      const dispensation = input.prescriptionItemId ? await prescriptionDispensationTx(tx, context, { ...shared, prescriptionItemId: input.prescriptionItemId }) : await manualDispensationTx(tx, context, { ...shared, patientId: item.request.patientId, medicineId: stock.material.medicine.id, prescriptionType: input.prescriptionType, prescriberProfessionalId: input.prescriberProfessionalId, dosage: input.dosage });
      const recorded = pharmacyRecord((await tx.select().from(pharmacyRequestFulfillments).where(eq(pharmacyRequestFulfillments.dispensationId, dispensation.id)).limit(1))[0]);
      return { fulfillmentId: recorded.id, dispensationId: dispensation.id };
    }
    await assertPatientPharmacyRequest(tx, context, { itemId: item.id, patientId: item.request.patientId, warehouseId: stock.warehouseId, materialId: stock.materialId, quantity: input.quantity });
    if (["MEDICINE", "CONTROLLED", "MANIPULATED"].includes(stock.material.healthProfile?.productKind || "")) throw new Error("Vincule o produto ao medicamento e à receita antes da entrega.");
    if (!stock.material.isActive || !stock.material.healthProfile?.isActive || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new Error("Produto ou lote indisponível para atendimento da demanda.");
    const patient = await readActivePharmacyPatient(tx, item.request.patientId);
    const receiverPersonId = input.receiverPersonId || patient.personId;
    if (!await isActivePharmacyPerson(tx, receiverPersonId) || receiverPersonId !== patient.personId && !input.receiverRelationship) throw new Error("Selecione retirante ativo e informe o vínculo com o paciente.");
    const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, idempotencyKey: input.idempotencyKey, reason: `DEMANDA_REPRIMIDA:${item.requestId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    await recordPharmacyRequestFulfillment(tx, context, { itemId: item.id, quantity: input.quantity, movementId: movement.id, receiverPersonId, reason: "Entrega do produto ao paciente" });
    const recorded = pharmacyRecord((await tx.select().from(pharmacyRequestFulfillments).where(eq(pharmacyRequestFulfillments.movementId, movement.id)).limit(1))[0]);
    return { fulfillmentId: recorded.id };
  }, { timeoutMs: 5_000 });
}

export async function cancelPharmacyProductFulfillment(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ fulfillmentId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "PharmacyRequestFulfillment" WHERE id=${input.fulfillmentId} FOR UPDATE`);
    const row = pharmacyRecord((await tx.select({ fulfillment: pharmacyRequestFulfillments, movement: materialMovements }).from(pharmacyRequestFulfillments).innerJoin(materialMovements, eq(materialMovements.id, pharmacyRequestFulfillments.movementId)).where(eq(pharmacyRequestFulfillments.id, input.fulfillmentId)).limit(1))[0]);
    const fulfillment = { ...row.fulfillment, movement: row.movement };
    const item = await lockPharmacyRequestItem(tx, context, fulfillment.requestItemId);
    if (fulfillment.dispensationId || fulfillment.transferItemId) throw new Error("Utilize o registro de dispensação ou o documento de transferência da origem.");
    if (fulfillment.status === "CANCELLED") return { id: fulfillment.id };
    await pharmacyDispensationAccess(tx, context, fulfillment.movement.warehouseId);
    await reverseStockMovementInTransaction(tx, { movementId: fulfillment.movementId, reason: `RECOMPOSICAO_DEMANDA:${input.reason}`, idempotencyKey: `CANCEL_PHARMACY_FULFILLMENT:${fulfillment.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    await updateFulfilledQuantity(tx, context, item.id, -fulfillment.quantity);
    await tx.update(pharmacyRequestFulfillments).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(pharmacyRequestFulfillments.id, fulfillment.id));
    const request = pharmacyRecord((await tx.select({ status: pharmacyRequests.status }).from(pharmacyRequests).where(eq(pharmacyRequests.id, item.requestId)).limit(1))[0]);
    await tx.insert(pharmacyRequestEvents).values({ requestId: item.requestId, status: request.status, reason: input.reason, actorUsuarioId: context.user.id });
    return { id: fulfillment.id };
  }, { timeoutMs: 5_000 });
}

export async function cancelPharmacyStockRequest(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "PharmacyRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const row = pharmacyRecord((await tx.select({ request: pharmacyRequests, destinationWarehouse: warehouses }).from(pharmacyRequests).innerJoin(warehouses, eq(warehouses.id, pharmacyRequests.destinationWarehouseId)).where(eq(pharmacyRequests.id, input.requestId)).limit(1))[0]);
    const request = { ...row.request, destinationWarehouse: row.destinationWarehouse };
    if (!request.destinationWarehouse.healthUnitId) throw new Error("Requisição não pertence à saúde.");
    assertHealthUnitAccess(context.user, request.destinationWarehouse.healthUnitId);
    if (request.status === "CANCELLED") return { id: request.id };
    if ((await tx.select({ id: pharmacyStockTransferItems.id }).from(pharmacyStockTransferItems).innerJoin(pharmacyRequestItems, eq(pharmacyRequestItems.id, pharmacyStockTransferItems.pharmacyRequestItemId)).innerJoin(pharmacyStockTransfers, eq(pharmacyStockTransfers.id, pharmacyStockTransferItems.transferId)).where(and(eq(pharmacyRequestItems.requestId, request.id), eq(pharmacyStockTransfers.status, "IN_TRANSIT"))).limit(1))[0]) throw new Error("Conclua o aceite das remessas em trânsito antes de cancelar a requisição.");
    await tx.update(pharmacyRequests).set({ status: "CANCELLED" }).where(eq(pharmacyRequests.id, request.id));
    await tx.insert(pharmacyRequestEvents).values({ requestId: request.id, status: "CANCELLED", reason: input.reason, actorUsuarioId: context.user.id });
    return { id: request.id };
  }, { timeoutMs: 5_000 });
}
