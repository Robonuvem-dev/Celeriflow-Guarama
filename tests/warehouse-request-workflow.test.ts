import assert from "node:assert/strict";
import test from "node:test";
import { count, eq, sql } from "drizzle-orm";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createMaterialRequest, approveMaterialRequest, issueMaterialRequestItem, issueMaterialRequestInFull } from "../src/lib/compras/procurement-lifecycle";
import { departments, employees } from "../src/db/schema/administration";
import { assets } from "../src/db/schema/assets";
import { equipmentCustodies, materialCategories, materials, materialMovements, materialStocks, warehouses } from "../src/db/schema/assets-stock";
import { materialRequestItems, materialRequests } from "../src/db/schema/assets-requests";

test("requisição: origem/destino, aprovação, entrega parcial, replay, saldo final e equipamento sem tombamento", async () => {
  const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture();
  try {
    const { connection } = f, database = connection.db;
    // These objects now come from the authoritative historical replay, including
    // custody FKs/uniqueness and the original stock numeric columns.
    const installed = await database.execute<{ sequence: string | null; custody: string | null }>(sql`SELECT to_regclass('"SequenceCounter"')::text AS sequence,to_regclass('"EquipmentCustody"')::text AS custody`);
    assert.ok(installed.rows[0].sequence && installed.rows[0].custody);
    await database.insert(departments).values({ id: "request-department", name: "Setor destinatário", secretariatId: "secretaria" });
    await database.insert(employees).values({ id: "requester", name: "Servidor requisitante", cpf: "00000000001", departmentId: "request-department", isActive: true });
    await database.insert(warehouses).values([{ id: "source", name: "Origem" }, { id: "wrong-source", name: "Outra origem" }]);
    await database.insert(materialCategories).values({ id: "request-category", code: "TEST", name: "Material de teste" });
    await database.insert(materials).values([{ id: "paper", code: "MAT000001", name: "Papel", categoryId: "request-category" }, { id: "monitor", code: "EQP000001", name: "Monitor", type: "PATRIMONIO", categoryId: "request-category" }]);
    await database.insert(materialStocks).values([{ id: "paper-stock", materialId: "paper", warehouseId: "source", quantity: 20, unitCost: 5 }, { id: "other-stock", materialId: "paper", warehouseId: "wrong-source", quantity: 20 }, { id: "equipment-stock", materialId: "monitor", warehouseId: "source", quantity: 3, unitCost: 800 }]);
    const requester = { usuarioId: "ana", employeeId: "requester" };
    const input = { sourceWarehouseId: "source", departmentId: "request-department", idempotencyKey: "request-create", items: [{ materialId: "paper", quantityRequested: 10 }] };
    await assert.rejects(createMaterialRequest(connection, requester, { ...input, number: "letras" }), /gerado automaticamente/);
    await assert.rejects(createMaterialRequest(connection, requester, { ...input, departmentId: "outro-setor" }), /setor de destino/);
    const request = await createMaterialRequest(connection, requester, input);
    assert.match(request.number, /^REQ-\d{4}-\d{6}$/);
    assert.equal((await createMaterialRequest(connection, requester, input)).id, request.id);
    assert.equal(request.sourceWarehouseId, "source");
    assert.equal(request.departmentId, "request-department");
    const [item] = await database.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id));
    assert.ok(item);
    const approval = { requestId: request.id, quantities: [{ itemId: item.id, quantityApproved: 10 }] };
    await assert.rejects(approveMaterialRequest(connection, requester, approval), /própria requisição/);
    await approveMaterialRequest(connection, f.actor, approval);
    await assert.rejects(issueMaterialRequestItem(connection, f.actor, { requestItemId: item.id, stockId: "other-stock", quantity: 1 }), /origem/);
    await database.update(materialStocks).set({ blockedAt: new Date() }).where(eq(materialStocks.id, "paper-stock"));
    await assert.rejects(issueMaterialRequestItem(connection, f.actor, { requestItemId: item.id, stockId: "paper-stock", quantity: 1 }), /bloqueado/);
    await database.update(materialStocks).set({ blockedAt: null }).where(eq(materialStocks.id, "paper-stock"));
    const delivery = { requestItemId: item.id, stockId: "paper-stock", quantity: 4, idempotencyKey: "partial-1" };
    await issueMaterialRequestItem(connection, f.actor, delivery);
    await issueMaterialRequestItem(connection, f.actor, delivery);
    assert.equal((await database.select().from(materialStocks).where(eq(materialStocks.id, "paper-stock")))[0].quantity, 16);
    assert.equal((await database.select().from(materialRequests).where(eq(materialRequests.id, request.id)))[0].status, "Atendida Parcialmente");
    await assert.rejects(issueMaterialRequestItem(connection, f.actor, { ...delivery, quantity: 5 }), /outros dados/);
    const full = { requestId: request.id, stockByItem: [{ requestItemId: item.id, stockId: "paper-stock" }] };
    await issueMaterialRequestInFull(connection, f.actor, full);
    await issueMaterialRequestInFull(connection, f.actor, full);
    assert.equal((await database.select().from(materialStocks).where(eq(materialStocks.id, "paper-stock")))[0].quantity, 10);
    assert.equal((await database.select().from(materialRequestItems).where(eq(materialRequestItems.id, item.id)))[0].quantityDelivered, 10);
    assert.equal((await database.select().from(materialRequests).where(eq(materialRequests.id, request.id)))[0].status, "Atendida");
    assert.equal((await database.select({ value: count() }).from(materialMovements).where(eq(materialMovements.materialRequestItemId, item.id)))[0].value, 2);
    await assert.rejects(createMaterialRequest(connection, requester, { ...input, idempotencyKey: "fractional-equipment", items: [{ materialId: "monitor", quantityRequested: 0.5 }] }), /unidades inteiras/);
    const equipment = await createMaterialRequest(connection, requester, { ...input, idempotencyKey: "equipment-request", items: [{ materialId: "monitor", quantityRequested: 2 }] });
    const [equipmentItem] = await database.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, equipment.id));
    assert.ok(equipmentItem);
    await approveMaterialRequest(connection, f.actor, { requestId: equipment.id, quantities: [{ itemId: equipmentItem.id, quantityApproved: 2 }] });
    await issueMaterialRequestInFull(connection, f.actor, { requestId: equipment.id, stockByItem: [{ requestItemId: equipmentItem.id, stockId: "equipment-stock" }] });
    const physical = await database.select().from(equipmentCustodies);
    assert.equal(physical.length, 2);
    assert.deepEqual(physical.map(row => row.code), ["EQP000002", "EQP000003"]);
    assert.ok(physical.every(row => row.departmentId === "request-department" && row.responsibleId === "requester" && row.stockMovementId));
    assert.equal((await database.select({ value: count() }).from(assets))[0].value, 0);
    assert.equal((await database.select().from(materialStocks).where(eq(materialStocks.id, "equipment-stock")))[0].quantity, 1);
  } finally {
    if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
    await f.close();
  }
});
