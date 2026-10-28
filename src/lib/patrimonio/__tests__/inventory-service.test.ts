import assert from "node:assert/strict";
import { test } from "node:test";
import { createInventorySession, recordInventoryCount, submitInventoryForApproval, closeApprovedInventory } from "../inventory-service";
import { recordStockMovement } from "../stock-service";
import { inventorySessions, inventorySessionItems, materialMovements, materialStocks } from "@/db/schema/assets-stock";
import { createAssetsFixture } from "./drizzle-fixture";

const actor = { usuarioId: "creator-1", employeeId: "employee-1" };

test("Drizzle approved closure records physical adjustment, evidence and releases movement lock atomically", async () => {
  const f = await createAssetsFixture();
  try {
    await recordStockMovement(f.connection, { kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 5, unitCost: 12, actor });
    const session = await createInventorySession(f.connection, { warehouseId: "warehouse-1", actor });
    assert.equal(session.items[0].expectedQuantity, 5);
    await assert.rejects(createInventorySession(f.connection, { warehouseId: "warehouse-1", actor }), /em andamento/);
    await assert.rejects(submitInventoryForApproval(f.connection, session.id), /Todos os itens/);
    await assert.rejects(recordInventoryCount(f.connection, { sessionId: session.id, itemId: session.items[0].id, countedQuantity: 3 }), /evidência/);
    await recordInventoryCount(f.connection, { sessionId: session.id, itemId: session.items[0].id, countedQuantity: 3, countEvidence: "Conferência física assinada", adjustmentReason: "Perda identificada na conferência física" });
    await submitInventoryForApproval(f.connection, session.id);
    await assert.rejects(closeApprovedInventory(f.connection, { sessionId: session.id, approvalEvidence: "Tentativa do inventoriante", actor }), /Segregação de Funções/);
    const closed = await closeApprovedInventory(f.connection, { sessionId: session.id, approvalEvidence: "Despacho 42/2026 aprovado pelo gestor", actor: { usuarioId: "approver-1", employeeId: "employee-1" } });
    assert.equal(closed.status, "CLOSED");
    assert.equal(closed.lockMovements, false);
    assert.equal(closed.approvalEvidence, "Despacho 42/2026 aprovado pelo gestor");
    const [item] = await f.connection.db.select().from(inventorySessionItems);
    const movements = await f.connection.db.select().from(materialMovements);
    const adjustment = movements.find(row => row.type === "Ajuste")!;
    assert.equal(adjustment.quantity, -2);
    assert.equal(adjustment.inventorySessionId, session.id);
    assert.equal(item.adjustmentMovementId, adjustment.id);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 3);
  } finally { await f.close(); }
});

test("Drizzle partial close failure restores all balances and keeps the approval/movement lock", async () => {
  const f = await createAssetsFixture();
  try {
    await recordStockMovement(f.connection, { kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 5, unitCost: 12, actor });
    const session = await createInventorySession(f.connection, { warehouseId: "warehouse-1", actor });
    await recordInventoryCount(f.connection, { sessionId: session.id, itemId: session.items[0].id, countedQuantity: 3, countEvidence: "Conferência", adjustmentReason: "Perda identificada" });
    await submitInventoryForApproval(f.connection, session.id);
    await f.pg.exec(`CREATE FUNCTION fail_inventory_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='CLOSED' THEN RAISE EXCEPTION 'close unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_inventory_close BEFORE UPDATE ON "InventorySession" FOR EACH ROW EXECUTE FUNCTION fail_inventory_close();`);
    await assert.rejects(closeApprovedInventory(f.connection, { sessionId: session.id, approvalEvidence: "Despacho aprovado", actor: { usuarioId: "approver-1" } }));
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 5);
    assert.equal((await f.connection.db.select().from(materialMovements)).length, 1);
    assert.equal((await f.connection.db.select().from(inventorySessionItems))[0].adjustmentMovementId, null);
    const [pending] = await f.connection.db.select().from(inventorySessions);
    assert.equal(pending.status, "PENDING_APPROVAL");
    assert.equal(pending.lockMovements, true);
  } finally { await f.close(); }
});
