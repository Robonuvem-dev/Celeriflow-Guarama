import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createHistoricalProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { saveSharedCatalogItem, syncMaterialCatalog } from "../src/lib/compras/shared-catalog";
import { approvePurchaseReceipt } from "../src/lib/compras/procurement-lifecycle";
import { withDatabaseTransaction } from "../src/db/transaction";
import { materials, materialStocks, materialMovements } from "../src/db/schema/assets-stock";
import { catalogItems } from "../src/db/schema/master-data";
import { purchaseRequests, purchaseReceipts, purchaseReceiptItems } from "../src/db/schema/procurement-requests";
import { purchaseProcesses, purchaseProcessItems, procurementContracts } from "../src/db/schema/procurement-core";

test("catálogo compartilhado: identidade MAT/EQP/SRV, parcial, replay, concorrência e rollback", async () => {
  const f = await createHistoricalProcurementWorkflowFixture();
  const db = f.connection.db;
  try {
    const base = { description: "Especificação", category: "Itens de teste", unit: "UN", estimatedValue: 5, isActive: true };
    const paper = await withDatabaseTransaction(f.connection, tx => saveSharedCatalogItem(tx, { ...base, name: "Papel", productKind: "MATERIAL" }));
    const equipment = await withDatabaseTransaction(f.connection, tx => saveSharedCatalogItem(tx, { ...base, name: "Monitor", productKind: "PATRIMONIO" }));
    const service = await withDatabaseTransaction(f.connection, tx => saveSharedCatalogItem(tx, { ...base, name: "Manutenção", unit: "H", productKind: "SERVICO" }));
    assert.equal(paper.code, "MAT000001"); assert.equal(equipment.code, "EQP000001"); assert.equal(service.code, "SRV000001");
    const [paperMaterial] = await db.select().from(materials).where(eq(materials.catalogItemId, paper.id));
    const [equipmentMaterial] = await db.select().from(materials).where(eq(materials.catalogItemId, equipment.id));
    assert.equal(paperMaterial.code, paper.code); assert.equal(equipmentMaterial.code, equipment.code);
    assert.equal((await db.select().from(materials)).length, 2);
    assert.equal((await db.select().from(materials).where(eq(materials.catalogItemId, service.id))).length, 0);
    await db.update(catalogItems).set({ code: "LEGADO" }).where(eq(catalogItems.id, paper.id));
    const restored = await withDatabaseTransaction(f.connection, tx => syncMaterialCatalog(tx, paperMaterial.id));
    assert.equal(restored.id, paper.id); assert.equal(restored.code, paperMaterial.code); assert.equal(restored.externalCode, "LEGADO");
    await db.insert(purchaseRequests).values({ id: "receipt-request", number: "REQ-TEST", object: "Itens compartilhados", justification: "Teste", status: "Aprovada", requesterId: "servidora-ana", departmentId: "setor", secretariatId: "secretaria" });
    await db.insert(purchaseProcesses).values({ id: "receipt-process", number: "PROC-TEST", object: "Itens compartilhados", type: "Comum", secretariatId: "secretaria", purchaseRequestId: "receipt-request" });
    await db.insert(purchaseProcessItems).values([
      { id: "paper-line", purchaseProcessId: "receipt-process", catalogItemId: paper.id, materialId: paperMaterial.id, quantity: 10, estimatedUnitValue: 5 },
      { id: "equipment-line", purchaseProcessId: "receipt-process", catalogItemId: equipment.id, materialId: equipmentMaterial.id, quantity: 2 },
      { id: "service-line", purchaseProcessId: "receipt-process", catalogItemId: service.id, quantity: 1 },
    ]);
    await db.insert(procurementContracts).values({ id: "receipt-contract", number: "CT-TEST", object: "Fornecimento", processId: "receipt-process", supplierId: "fornecedor", secretariatId: "secretaria", initialValue: 100, updatedValue: 100, status: "Vigente", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") });
    const actor = { usuarioId: "beatriz", employeeId: "aprovadora" };
    const input = { number: "REC-TEST-1", receivedAt: new Date("2026-10-14T12:00:00Z"), contractId: "receipt-contract", documentId: "documento-fiscal", receiverId: "recebedor", attesterId: "aprovadora", idempotencyKey: "receipt-test-1", items: [{ purchaseProcessItemId: "paper-line", materialId: paperMaterial.id, warehouseId: "central", quantity: 4, unitCost: 5 }] };
    await f.database.exec(`CREATE FUNCTION reject_shared_receipt_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PURCHASE_RECEIPT_APPROVED' THEN RAISE EXCEPTION 'receipt event failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_shared_receipt_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION reject_shared_receipt_event();`);
    await assert.rejects(approvePurchaseReceipt(f.connection, actor, input), error => {
      const seen = new Set<unknown>();
      let cause: unknown = error;
      while (cause instanceof Error && !seen.has(cause)) {
        if (cause.message.includes("receipt event failure")) return true;
        seen.add(cause); cause = cause.cause;
      }
      return false;
    });
    assert.equal((await db.select().from(purchaseReceipts)).length, 0);
    assert.equal((await db.select().from(materialStocks)).length, 0);
    assert.equal((await db.select().from(materialMovements)).length, 0);
    await f.database.exec(`DROP TRIGGER reject_shared_receipt_event ON "ProcurementLifecycleEvent"; DROP FUNCTION reject_shared_receipt_event();`);
    const first = await approvePurchaseReceipt(f.connection, actor, input);
    assert.equal((await approvePurchaseReceipt(f.connection, actor, input)).id, first.id);
    await assert.rejects(approvePurchaseReceipt(f.connection, actor, { ...input, items: [{ ...input.items[0], quantity: 5 }] }), /outros dados/);
    const concurrent = await Promise.allSettled([2, 3].map(index => approvePurchaseReceipt(f.connection, actor, { ...input, number: `REC-TEST-${index}`, idempotencyKey: `receipt-test-${index}` })));
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.materialId, paperMaterial.id)))[0].quantity, 8);
    await approvePurchaseReceipt(f.connection, actor, { ...input, number: "REC-TEST-4", idempotencyKey: "receipt-test-4", items: [{ ...input.items[0], quantity: 2 }] });
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.materialId, paperMaterial.id)))[0].quantity, 10);
    await approvePurchaseReceipt(f.connection, actor, { ...input, number: "REC-TEST-EQP", idempotencyKey: "receipt-test-eqp", items: [{ ...input.items[0], purchaseProcessItemId: "equipment-line", materialId: equipmentMaterial.id, quantity: 2 }] });
    assert.equal((await db.select().from(materialStocks).where(eq(materialStocks.materialId, equipmentMaterial.id)))[0].quantity, 2);
    await assert.rejects(approvePurchaseReceipt(f.connection, actor, { ...input, number: "REC-SERVICE", idempotencyKey: "receipt-service", items: [{ ...input.items[0], purchaseProcessItemId: "service-line", quantity: 1 }] }), /deve corresponder/);
    assert.equal((await db.select({ id: materialMovements.id }).from(materialMovements).innerJoin(purchaseReceiptItems, eq(purchaseReceiptItems.stockMovementId, materialMovements.id))).length, 4);
  } finally { await f.close(); }
});
