import assert from "node:assert/strict";
import { test } from "node:test";
import { approvePurchaseReceipt, ProcurementLifecycleError } from "../src/lib/compras/procurement-lifecycle";
import { normalizeStockMovement, StockServiceError } from "../src/lib/patrimonio/stock-service";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";

const actor = { usuarioId: "user-1", employeeId: "employee-1" };

test("C5 rejects manual stock entries before any database operation", () => {
  assert.throws(
    () => normalizeStockMovement({ kind: "ENTRY", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, actor }),
    StockServiceError,
  );
  assert.equal(
    normalizeStockMovement({ kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", warehouseId: "warehouse-1", materialId: "material-1", quantity: 1, actor }).sourceType,
    "APPROVED_PURCHASE_RECEIPT",
  );
});

test("C5 rejects a receipt without items before any database operation", async () => {
  await assert.rejects(
    approvePurchaseReceipt({} as never, actor, {
      number: "REC-1",
      receivedAt: new Date("2026-08-17T12:00:00.000Z"),
      contractId: "contract-1",
      documentId: "document-1",
      receiverId: "employee-2",
      attesterId: "employee-3",
      idempotencyKey: "receipt-1",
      items: [],
    }),
    ProcurementLifecycleError,
  );
});

test("C5 requires separate receiver and attester before any database operation", async () => {
  await assert.rejects(
    approvePurchaseReceipt({} as never, actor, {
      number: "REC-1",
      receivedAt: new Date("2026-08-17T12:00:00.000Z"),
      contractId: "contract-1",
      documentId: "document-1",
      receiverId: "employee-2",
      attesterId: "employee-2",
      idempotencyKey: "receipt-2",
      items: [{ purchaseProcessItemId: "process-item-1", materialId: "material-1", warehouseId: "warehouse-1", quantity: 1, unitCost: 10 }],
    }),
    ProcurementLifecycleError,
  );
});

test("C5 rejects a receipt line when its material differs from the approved process item", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`
      INSERT INTO "MaterialCategory" (id, code, name) VALUES ('cat', 'CAT', 'Materiais');
      INSERT INTO "Material" (id, code, name, "categoryId") VALUES ('material-approved', 'MAT1', 'Papel', 'cat');
      INSERT INTO "PurchaseRequest" (id, number, object, justification, status, "secretariatId", "departmentId", "requesterId") VALUES ('req', 'REQ', 'Material', 'Reposição', 'Aprovada', 'secretaria', 'setor', 'servidora-ana');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId", "purchaseRequestId") VALUES ('proc', 'PROC', 'Material', 'Comum', 'secretaria', 'req');
      INSERT INTO "PurchaseProcessItem" (id, "purchaseProcessId", quantity, "materialId") VALUES ('process-item-1', 'proc', 1, 'material-approved');
      INSERT INTO "Contract" (id, number, object, "initialValue", "updatedValue", "startDate", "endDate", status, "processId", "supplierId", "secretariatId") VALUES ('contract-1', 'CT1', 'Material', 10, 10, '2026-01-01', '2026-12-31', 'Vigente', 'proc', 'fornecedor', 'secretaria');
    `);
    await assert.rejects(approvePurchaseReceipt(f.connection, { usuarioId: "beatriz", employeeId: "aprovadora" }, {
      number: "REC-1",
      receivedAt: new Date("2026-08-17T12:00:00.000Z"),
      contractId: "contract-1",
      documentId: "documento-fiscal",
      receiverId: "recebedor",
      attesterId: "aprovadora",
      idempotencyKey: "receipt-material-mismatch",
      items: [{ purchaseProcessItemId: "process-item-1", materialId: "material-other", warehouseId: "central", quantity: 1, unitCost: 10 }],
    }), /deve corresponder ao item de material/);
    assert.equal((await f.database.query('SELECT id FROM "PurchaseReceipt"')).rows.length, 0);
    assert.equal((await f.database.query('SELECT id FROM "MaterialMovement"')).rows.length, 0);
  } finally { await f.close(); }
});
