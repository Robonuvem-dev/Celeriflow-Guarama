import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { recordStockMovement, returnStockMovement, reverseStockMovement, StockServiceError, normalizeStockMovement } from "../stock-service";
import { materialStocks, materialMovements } from "@/db/schema/assets-stock";
import { createAssetsFixture } from "./drizzle-fixture";

const actor = { usuarioId: "user-1", employeeId: "employee-1" };
const input = { warehouseId: "warehouse-1", materialId: "material-1", actor };

test("normalizes batch, signed adjustments, costs and settlement eligibility before writing", () => {
  assert.equal(normalizeStockMovement({ ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 3 }).batchNumber, "");
  assert.equal(normalizeStockMovement({ ...input, kind: "ADJUSTMENT", quantity: -2 }).quantity, -2);
  for (const kind of ["ENTRY", "EXIT"] as const) assert.throws(() => normalizeStockMovement({ ...input, kind, quantity: -2 }), StockServiceError);
  assert.throws(() => normalizeStockMovement({ ...input, kind: "ENTRY", quantity: 0 }), StockServiceError);
  assert.throws(() => normalizeStockMovement({ ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 1, unitCost: -1 }), StockServiceError);
  assert.equal(normalizeStockMovement({ ...input, kind: "EXIT", quantity: 1, settlementId: "settlement-1" }).settlementId, "settlement-1");
  assert.throws(() => normalizeStockMovement({ ...input, kind: "ENTRY", quantity: 1, settlementId: "settlement-1" }), StockServiceError);
});

test("Drizzle stock entry preserves Decimal memory, actor, original IDs and atomic balance", async () => {
  const f = await createAssetsFixture();
  try {
    const result = await recordStockMovement(f.connection, { ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 3, unitCost: 12, reason: "Nota fiscal 123" });
    assert.equal(result.movement.quantityDecimal?.toFixed(6), "3.000000");
    assert.equal(result.movement.unitValueDecimal?.toFixed(6), "12.000000");
    assert.equal(result.movement.totalValueDecimal?.toFixed(2), "36.00");
    assert.equal(result.movement.actorUsuarioId, actor.usuarioId);
    assert.equal(result.movement.actorEmployeeId, actor.employeeId);
    assert.ok(result.movement.date instanceof Date);
    assert.match(result.movement.id, /^c/);
    const second = await recordStockMovement(f.connection, { ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 2 });
    assert.equal(second.stock.id, result.stock.id);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 5);
    assert.equal(second.stock.unitCost, 12);
    await assert.rejects(recordStockMovement(f.connection, { ...input, kind: "EXIT", quantity: 6 }), /insuficiente/);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 5);
    assert.equal((await f.connection.db.select().from(materialMovements)).length, 2);
  } finally { await f.close(); }
});

test("Drizzle locks inventory for every regular movement and rolls back balance when audit fails", async () => {
  const f = await createAssetsFixture();
  try {
    await f.pg.exec(`INSERT INTO "InventorySession" (id,"warehouseId","createdByUsuarioId","updatedAt") VALUES ('inventory-1','warehouse-1','user-1',CURRENT_TIMESTAMP)`);
    for (const kind of ["ENTRY", "EXIT", "ADJUSTMENT"] as const) {
      await assert.rejects(recordStockMovement(f.connection, { ...input, kind, ...(kind === "ENTRY" ? { sourceType: "APPROVED_PURCHASE_RECEIPT" as const } : {}), quantity: 1 }), /Movimentações estão bloqueadas/);
    }
    await f.pg.exec(`UPDATE "InventorySession" SET status='CLOSED', "lockMovements"=false;
      CREATE FUNCTION fail_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER fail_stock_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_stock_audit();`);
    await assert.rejects(recordStockMovement(f.connection, { ...input, kind: "ADJUSTMENT", quantity: 2, unitCost: 10 }), error => error instanceof Error && error.cause instanceof Error && /audit unavailable/.test(error.cause.message));
    assert.equal((await f.connection.db.select().from(materialStocks)).length, 0);
    assert.equal((await f.connection.db.select().from(materialMovements)).length, 0);
  } finally { await f.close(); }
});

test("Drizzle settlement link is validated and persisted on a regular exit", async () => {
  const f = await createAssetsFixture();
  try {
    await recordStockMovement(f.connection, { ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 2, unitCost: 12 });
    await assert.rejects(recordStockMovement(f.connection, { ...input, kind: "EXIT", quantity: 1, settlementId: "settlement-1" }), /Liquidação não encontrada/);
    await f.pg.exec(`INSERT INTO "Settlement" VALUES ('settlement-1','Liquidado')`);
    const result = await recordStockMovement(f.connection, { ...input, kind: "EXIT", quantity: 1, settlementId: "settlement-1" });
    assert.equal(result.movement.settlementId, "settlement-1");
  } finally { await f.close(); }
});

test("Drizzle returns retain source cost/batch, enforce cumulative quantity and replay identity", async () => {
  const f = await createAssetsFixture();
  try {
    await recordStockMovement(f.connection, { ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 4, unitCost: 12, batchNumber: "LOT-2026-01" });
    const { movement: original } = await recordStockMovement(f.connection, { ...input, kind: "EXIT", quantity: 4, batchNumber: "LOT-2026-01" });
    const request = { movementId: original.id, quantity: 2, reason: "Material não utilizado pela unidade requisitante", idempotencyKey: "stock-return-1", actor };
    const returned = await returnStockMovement(f.connection, request);
    assert.equal(returned.operation, "RETURN");
    assert.equal(returned.returnedMovementId, original.id);
    assert.equal(returned.unitValue, 12);
    assert.equal((await returnStockMovement(f.connection, request)).id, returned.id);
    await assert.rejects(returnStockMovement(f.connection, { ...request, quantity: 1 }), /Chave já utilizada/);
    await assert.rejects(returnStockMovement(f.connection, { ...request, quantity: 3, idempotencyKey: "over-limit" }), /excede a quantidade/);
    const [stock] = await f.connection.db.select().from(materialStocks).where(eq(materialStocks.id, returned.stockId!));
    assert.equal(stock.batchNumber, "LOT-2026-01");
    assert.equal(stock.quantity, 2);
    await assert.rejects(reverseStockMovement(f.connection, { movementId: original.id, reason: "Estorno solicitado", idempotencyKey: "cannot-reverse-returned", actor }), /com devolução/);
  } finally { await f.close(); }
});

test("Drizzle reversal creates one compensating entry and audit; replay does not duplicate", async () => {
  const f = await createAssetsFixture();
  try {
    await recordStockMovement(f.connection, { ...input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 2, unitCost: 8.5 });
    const { movement: original } = await recordStockMovement(f.connection, { ...input, kind: "EXIT", quantity: 2 });
    const request = { movementId: original.id, reason: "Saída registrada para o lote incorreto", idempotencyKey: "stock-reversal-1", actor };
    const reversal = await reverseStockMovement(f.connection, request);
    assert.equal(reversal.type, "Entrada");
    assert.equal(reversal.operation, "REVERSAL");
    assert.equal(reversal.reversedMovementId, original.id);
    assert.equal(reversal.quantity, 2);
    assert.equal(reversal.unitValue, 8.5);
    assert.equal((await reverseStockMovement(f.connection, request)).id, reversal.id);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 2);
    assert.equal((await f.connection.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "AuditEvent"`)).rows[0].count, 1);
  } finally { await f.close(); }
});
