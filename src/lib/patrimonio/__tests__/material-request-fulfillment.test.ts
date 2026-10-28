import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createMaterialRequest, approveMaterialRequest, ProcurementLifecycleError, issueMaterialRequestInFull } from "../../compras/procurement-lifecycle";
import { materials, materialStocks, materialMovements, equipmentCustodies } from "@/db/schema/assets-stock";
import { materialRequests, materialRequestItems } from "@/db/schema/assets-requests";
import { procurementLifecycleEvents } from "@/db/schema/procurement-requests";
import { createAssetsFixture } from "./drizzle-fixture";

const actor = { usuarioId: "user-issuer", employeeId: "employee-issuer" };
async function fixture() {
  const result = await createAssetsFixture([materialRequests, materialRequestItems, procurementLifecycleEvents]);
  await result.pg.exec(`INSERT INTO "Department" (id,name) VALUES ('department-1','Setor');
    INSERT INTO "Employee" (id,"departmentId") VALUES ('employee-requester','department-1'), ('employee-issuer','department-1');`);
  await result.connection.db.insert(materials).values({ id: "equipment", code: "EQP000001", name: "Monitor", type: "PATRIMONIO", categoryId: "category-1" });
  await result.connection.db.insert(materialStocks).values([
    { id: "stock-paper", materialId: "material-1", warehouseId: "warehouse-1", quantity: 100, unitCost: 25 },
    { id: "stock-equipment", materialId: "equipment", warehouseId: "warehouse-1", quantity: 5, unitCost: 200 },
  ]);
  return result;
}
const input = { sourceWarehouseId: "warehouse-1", idempotencyKey: "material-request-1", justification: "Reposição do setor demonstrativo", items: [{ materialId: "material-1", quantityRequested: 30 }, { materialId: "equipment", quantityRequested: 2 }] };
const requester = { usuarioId: "user-requester", employeeId: "employee-requester" };

test("creates an idempotent request for the authenticated employee department", async () => {
  const f = await fixture();
  try {
    const request = await createMaterialRequest(f.connection, requester, input);
    assert.match(request.number, /^REQ-\d{4}-000001$/);
    assert.equal(request.departmentId, "department-1"); assert.equal(request.requesterId, requester.employeeId);
    assert.equal(request.sourceWarehouseId, "warehouse-1"); assert.equal(request.justification, input.justification);
    assert.equal((await createMaterialRequest(f.connection, requester, input)).id, request.id);
    const items = await f.connection.db.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id));
    assert.deepEqual(items.map(item => ({ materialId: item.materialId, quantityRequested: item.quantityRequested })), input.items);
    assert.equal((await f.connection.db.select().from(materialRequests)).length, 1);
    assert.equal((await f.connection.db.select().from(procurementLifecycleEvents)).length, 1);
    await assert.rejects(approveMaterialRequest(f.connection, requester, { requestId: request.id, quantities: items.map(item => ({ itemId: item.id, quantityApproved: item.quantityRequested })) }), /Segregação/);
  } finally { await f.close(); }
});

test("full delivery issues every remaining request line in the same transaction", async () => {
  const f = await fixture(); const db = f.connection.db;
  try {
    const request = await createMaterialRequest(f.connection, requester, input);
    const items = await db.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id));
    await approveMaterialRequest(f.connection, actor, { requestId: request.id, quantities: items.map(item => ({ itemId: item.id, quantityApproved: item.quantityRequested })) });
    const delivery = { requestId: request.id, stockByItem: items.map(item => ({ requestItemId: item.id, stockId: item.materialId === "equipment" ? "stock-equipment" : "stock-paper" })) };
    assert.equal((await issueMaterialRequestInFull(f.connection, actor, delivery)).status, "Atendida");
    await issueMaterialRequestInFull(f.connection, actor, delivery);
    const movements = await db.select().from(materialMovements);
    assert.equal(movements.length, 2); assert.deepEqual(movements.map(movement => movement.quantity).sort((a, b) => a - b), [2, 30]);
    assert.ok(movements.every(movement => movement.type === "Saída" && movement.actorEmployeeId === actor.employeeId && movement.departmentId === "department-1"));
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.id, "stock-paper")))[0].quantity, 70);
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.id, "stock-equipment")))[0].quantity, 3);
    assert.ok((await db.select().from(materialRequestItems)).every(item => item.quantityDelivered === item.quantityApproved));
    const custodies = await db.select().from(equipmentCustodies);
    assert.equal(custodies.length, 2); assert.ok(custodies.every(custody => custody.responsibleId === requester.employeeId && custody.stockMovementId === movements.find(movement => movement.materialId === "equipment")!.id));
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 3, "replay não duplica evento de atendimento");
  } finally { await f.close(); }
});

test("full delivery rejects incomplete assignments and rolls back all lines when a later balance fails", async () => {
  const f = await fixture(); const db = f.connection.db;
  try {
    const request = await createMaterialRequest(f.connection, requester, input);
    const items = await db.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id));
    await approveMaterialRequest(f.connection, actor, { requestId: request.id, quantities: items.map(item => ({ itemId: item.id, quantityApproved: item.quantityRequested })) });
    await assert.rejects(issueMaterialRequestInFull(f.connection, actor, { requestId: request.id, stockByItem: [{ requestItemId: items[0].id, stockId: "stock-paper" }] }), ProcurementLifecycleError);
    assert.equal((await db.select().from(materialRequests))[0].status, "Aprovada");
    await db.update(materialStocks).set({ quantity: 1 }).where(eq(materialStocks.id, "stock-equipment"));
    await assert.rejects(issueMaterialRequestInFull(f.connection, actor, { requestId: request.id, stockByItem: items.map(item => ({ requestItemId: item.id, stockId: item.materialId === "equipment" ? "stock-equipment" : "stock-paper" })) }), /Estoque insuficiente/);
    assert.equal((await db.select().from(materialRequests))[0].status, "Aprovada");
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.id, "stock-paper")))[0].quantity, 100);
    assert.ok((await db.select().from(materialRequestItems)).every(item => item.quantityDelivered === 0));
    assert.equal((await db.select().from(materialMovements)).length, 0); assert.equal((await db.select().from(equipmentCustodies)).length, 0);
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 2);
  } finally { await f.close(); }
});

test("request codes cannot be supplied manually", async () => {
  const f = await fixture();
  try { await assert.rejects(createMaterialRequest(f.connection, actor, { ...input, number: "abcdef" }), /gerado automaticamente/); }
  finally { await f.close(); }
});
