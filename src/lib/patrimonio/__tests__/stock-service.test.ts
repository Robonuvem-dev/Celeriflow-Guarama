import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { recordStockMovement, returnStockMovement, reverseStockMovement, StockServiceError, normalizeStockMovement } from "../stock-service";

const actor = { usuarioId: "user-1", employeeId: "employee-1" };

test("normalizes an omitted batch to the single non-batch stock key", () => {
  const movement = normalizeStockMovement({ kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 3, actor });
  assert.equal(movement.batchNumber, "");
  assert.equal(movement.quantity, 3);
});

test("allows signed adjustments but rejects signed entries and exits", () => {
  assert.equal(normalizeStockMovement({ kind: "ADJUSTMENT", warehouseId: "warehouse-1", materialId: "material-1", quantity: -2, actor }).quantity, -2);
  assert.throws(
    () => normalizeStockMovement({ kind: "EXIT", warehouseId: "warehouse-1", materialId: "material-1", quantity: -2, actor }),
    StockServiceError,
  );
});

test("rejects invalid stock quantities and costs before writing", () => {
  assert.throws(
    () => normalizeStockMovement({ kind: "ENTRY", warehouseId: "warehouse-1", materialId: "material-1", quantity: 0, actor }),
    StockServiceError,
  );
  assert.throws(
    () => normalizeStockMovement({ kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, unitCost: -1, actor }),
    StockServiceError,
  );
});

test("allows a settlement only on stock exits", () => {
  assert.equal(normalizeStockMovement({ kind: "EXIT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, settlementId: "settlement-1", actor }).settlementId, "settlement-1");
  assert.throws(
    () => normalizeStockMovement({ kind: "ENTRY", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, settlementId: "settlement-1", actor }),
    StockServiceError,
  );
});

test("records the stock row and audit evidence in one transaction", async () => {
  const movements: Array<Record<string, unknown>> = [];
  const transaction = {
    $executeRaw: async () => 1,
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    material: { findUnique: async () => ({ id: "material-1" }) },
    inventorySession: { findFirst: async () => null },
    materialStock: { findUnique: async () => null, upsert: async () => ({ id: "stock-1", unitCost: 12 }) },
    materialMovement: { create: async ({ data }: { data: Record<string, unknown> }) => { movements.push(data); return { id: "movement-1" }; } },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  };

  await recordStockMovement(database as never, {
    kind: "ENTRY",
    sourceType: "APPROVED_PURCHASE_RECEIPT",
    warehouseId: "warehouse-1",
    materialId: "material-1",
    quantity: 3,
    unitCost: 12,
    reason: "Nota fiscal 123",
    actor,
  });

  assert.deepEqual(movements[0], {
    type: "Entrada",
    quantity: 3,
    unitValue: 12,
    quantityDecimal: new Prisma.Decimal(3),
    unitValueDecimal: new Prisma.Decimal(12),
    totalValueDecimal: new Prisma.Decimal(36),
    reason: "Nota fiscal 123",
    warehouseId: "warehouse-1",
    materialId: "material-1",
    stockId: "stock-1",
    supplierId: null,
    departmentId: null,
    obrasServicoId: null,
    settlementId: null,
    inventorySessionId: null,
    materialRequestItemId: null,
    operation: "REGULAR",
    idempotencyKey: null,
    returnedMovementId: null,
    reversedMovementId: null,
    actorUsuarioId: "user-1",
    actorEmployeeId: "employee-1",
  });
});

test("persists an active settlement reference with a stock exit", async () => {
  const movements: Array<Record<string, unknown>> = [];
  const transaction = {
    $executeRaw: async () => 1,
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    material: { findUnique: async () => ({ id: "material-1" }) },
    settlement: { findFirst: async () => ({ id: "settlement-1" }) },
    inventorySession: { findFirst: async () => null },
    materialStock: {
      findUnique: async () => ({ id: "stock-1", unitCost: 12 }),
      updateMany: async () => ({ count: 1 }),
    },
    materialMovement: { create: async ({ data }: { data: Record<string, unknown> }) => { movements.push(data); return { id: "movement-1" }; } },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };

  await recordStockMovement(database as never, {
    kind: "EXIT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, settlementId: "settlement-1", actor,
  });

  assert.equal(movements[0].settlementId, "settlement-1");
});

test("blocks every regular stock movement while the warehouse inventory is locked", async () => {
  const transaction = {
    $executeRaw: async () => 1,
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    material: { findUnique: async () => ({ id: "material-1" }) },
    inventorySession: { findFirst: async () => ({ id: "inventory-1" }) },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };

  for (const kind of ["ENTRY", "EXIT", "ADJUSTMENT"] as const) {
    await assert.rejects(
      recordStockMovement(database as never, { kind, ...(kind === "ENTRY" ? { sourceType: "APPROVED_PURCHASE_RECEIPT" as const } : {}), warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, actor }),
      /Movimentações estão bloqueadas enquanto o inventário/,
    );
  }
});

test("records a partial return against the original exit and its original cost", async () => {
  const movements: Array<Record<string, unknown>> = [];
  const original = {
    id: "movement-exit-1",
    type: "Saída",
    operation: "REGULAR",
    quantity: 4,
    unitValue: 12,
    warehouseId: "warehouse-1",
    materialId: "material-1",
    departmentId: "department-1",
    stock: { batchNumber: "LOT-2026-01" },
    reversalMovement: null,
  };
  const transaction = {
    $executeRaw: async () => 1,
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    material: { findUnique: async () => ({ id: "material-1", isActive: true }) },
    inventorySession: { findFirst: async () => null },
    materialStock: { findUnique: async () => null, upsert: async () => ({ id: "stock-1", unitCost: 12 }) },
    materialMovement: {
      findUnique: async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => where.id ? original : null,
      aggregate: async () => ({ _sum: { quantity: 1 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => { movements.push(data); return { id: "movement-return-1", ...data }; },
    },
    auditEvent: { create: async () => ({ id: "audit-1" }) },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };

  await returnStockMovement(database as never, {
    movementId: original.id,
    quantity: 2,
    reason: "Material não utilizado pela unidade requisitante",
    idempotencyKey: "stock-return-1",
    actor,
  });

  assert.equal(movements[0].type, "Entrada");
  assert.equal(movements[0].operation, "RETURN");
  assert.equal(movements[0].returnedMovementId, original.id);
  assert.equal(movements[0].quantity, 2);
  assert.equal(movements[0].unitValue, 12);
  assert.equal(movements[0].batchNumber, undefined);
});

test("rejects returns above the remaining quantity of the original exit", async () => {
  const original = {
    id: "movement-exit-1",
    type: "Saída",
    operation: "REGULAR",
    quantity: 4,
    unitValue: 12,
    warehouseId: "warehouse-1",
    materialId: "material-1",
    departmentId: null,
    stock: { batchNumber: "" },
    reversalMovement: null,
  };
  const transaction = {
    $executeRaw: async () => 1,
    materialMovement: {
      findUnique: async ({ where }: { where: { id?: string } }) => where.id ? original : null,
      aggregate: async () => ({ _sum: { quantity: 3 } }),
    },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };

  await assert.rejects(
    returnStockMovement(database as never, {
      movementId: original.id,
      quantity: 2,
      reason: "Material não utilizado pela unidade requisitante",
      idempotencyKey: "stock-return-over-limit",
      actor,
    }),
    /excede a quantidade da saída original/,
  );
});

test("reverses an exit with one compensating entry", async () => {
  const movements: Array<Record<string, unknown>> = [];
  const original = {
    id: "movement-exit-1",
    type: "Saída",
    operation: "REGULAR",
    quantity: 2,
    unitValue: 8.5,
    warehouseId: "warehouse-1",
    materialId: "material-1",
    departmentId: "department-1",
    stock: { batchNumber: "" },
    reversalMovement: null,
    returnMovements: [],
  };
  const transaction = {
    $executeRaw: async () => 1,
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    material: { findUnique: async () => ({ id: "material-1", isActive: true }) },
    inventorySession: { findFirst: async () => null },
    materialStock: { findUnique: async () => null, upsert: async () => ({ id: "stock-1", unitCost: 8.5 }) },
    materialMovement: {
      findUnique: async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => where.id ? original : null,
      create: async ({ data }: { data: Record<string, unknown> }) => { movements.push(data); return { id: "movement-reversal-1", ...data }; },
    },
    auditEvent: { create: async () => ({ id: "audit-1" }) },
  };
  const database = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };

  await reverseStockMovement(database as never, {
    movementId: original.id,
    reason: "Saída registrada para o lote incorreto",
    idempotencyKey: "stock-reversal-1",
    actor,
  });

  assert.equal(movements[0].type, "Entrada");
  assert.equal(movements[0].operation, "REVERSAL");
  assert.equal(movements[0].reversedMovementId, original.id);
  assert.equal(movements[0].quantity, 2);
  assert.equal(movements[0].unitValue, 8.5);
});
