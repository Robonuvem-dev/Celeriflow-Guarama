import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { saveSharedCatalogItem, syncMaterialCatalog } from "../src/lib/compras/shared-catalog";
import { approvePurchaseReceipt } from "../src/lib/compras/procurement-lifecycle";

test("catálogo compartilhado: identidade MAT/EQP/SRV, recebimento parcial, replay, concorrência e reversão atômica", async () => {
  const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture();
  try {
    await f.pg.exec(`
      CREATE TABLE "CatalogItem" (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, description TEXT, unit TEXT DEFAULT 'UN', category TEXT, "estimatedValue" DOUBLE PRECISION, "isActive" BOOLEAN DEFAULT TRUE, "productKind" TEXT DEFAULT 'MATERIAL', specification TEXT, "externalCode" TEXT, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "SequenceCounter" (id TEXT PRIMARY KEY, key TEXT UNIQUE, value INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "EquipmentCustody" (id TEXT PRIMARY KEY, code TEXT UNIQUE);
      CREATE UNIQUE INDEX "shared_stock_identity" ON "MaterialStock" ("warehouseId","materialId","batchNumber");
      ALTER TABLE "MaterialMovement" ADD COLUMN IF NOT EXISTS "quantityDecimal" NUMERIC(18,6);
      ALTER TABLE "MaterialMovement" ADD COLUMN IF NOT EXISTS "unitValueDecimal" NUMERIC(18,6);
      ALTER TABLE "MaterialMovement" ADD COLUMN IF NOT EXISTS "totalValueDecimal" NUMERIC(18,2);
    `);
    const base = { description: "Especificação", category: "Itens de teste", unit: "UN", estimatedValue: 5, isActive: true };
    const paper = await f.db.$transaction(tx => saveSharedCatalogItem(tx, { ...base, name: "Papel", productKind: "MATERIAL" }));
    const equipment = await f.db.$transaction(tx => saveSharedCatalogItem(tx, { ...base, name: "Monitor", productKind: "PATRIMONIO" }));
    const service = await f.db.$transaction(tx => saveSharedCatalogItem(tx, { ...base, name: "Manutenção", unit: "H", productKind: "SERVICO" }));
    assert.equal(paper.code, "MAT000001"); assert.equal(equipment.code, "EQP000001"); assert.equal(service.code, "SRV000001");
    const paperMaterial = await f.db.material.findFirstOrThrow({ where: { catalogItemId: paper.id } });
    const equipmentMaterial = await f.db.material.findFirstOrThrow({ where: { catalogItemId: equipment.id } });
    assert.equal(paperMaterial.code, paper.code); assert.equal(equipmentMaterial.code, equipment.code);
    assert.equal(await f.db.material.count(), 2); assert.equal(await f.db.material.count({ where: { catalogItemId: service.id } }), 0);
    await f.db.catalogItem.update({ where: { id: paper.id }, data: { code: "LEGADO" } });
    const restored = await f.db.$transaction(tx => syncMaterialCatalog(tx, paperMaterial.id));
    assert.equal(restored.id, paper.id); assert.equal(restored.code, paperMaterial.code); assert.equal(restored.externalCode, "LEGADO");
    await f.db.department.create({ data: { id: "receipt-department", name: "Destinatário", secretariatId: "secretaria" } });
    await f.db.employee.createMany({ data: [{ id: "requester", name: "Solicitante", cpf: "00000000001", departmentId: "receipt-department", isActive: true }, { id: "attester", name: "Atestador", cpf: "00000000002", departmentId: "receipt-department", isActive: true }] });
    await f.db.warehouse.create({ data: { id: "receipt-warehouse", name: "Almoxarifado" } });
    await f.db.purchaseRequest.create({ data: { id: "receipt-request", number: "REQ-TEST", object: "Itens compartilhados", justification: "Teste", status: "Aprovada", requesterId: "requester", departmentId: "receipt-department", secretariatId: "secretaria" } });
    await f.db.purchaseProcess.create({ data: { id: "receipt-process", number: "PROC-TEST", object: "Itens compartilhados", type: "Comum", secretariatId: "secretaria", purchaseRequestId: "receipt-request", items: { create: [{ id: "paper-line", catalogItemId: paper.id, materialId: paperMaterial.id, quantity: 10, estimatedUnitValue: 5 }, { id: "equipment-line", catalogItemId: equipment.id, materialId: equipmentMaterial.id, quantity: 2 }, { id: "service-line", catalogItemId: service.id, quantity: 1 }] } } });
    await f.db.contract.create({ data: { id: "receipt-contract", number: "CT-TEST", object: "Fornecimento", processId: "receipt-process", supplierId: "fornecedor", secretariatId: "secretaria", initialValue: 100, updatedValue: 100, status: "Vigente", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
    const input = { number: "REC-TEST-1", receivedAt: new Date("2026-10-14T12:00:00Z"), contractId: "receipt-contract", documentId: "documento-fiscal", receiverId: "servidora-ana", attesterId: "attester", idempotencyKey: "receipt-test-1", items: [{ purchaseProcessItemId: "paper-line", materialId: paperMaterial.id, warehouseId: "receipt-warehouse", quantity: 4, unitCost: 5 }] };
    await f.pg.exec(`CREATE FUNCTION reject_shared_receipt_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PURCHASE_RECEIPT_APPROVED' THEN RAISE EXCEPTION 'receipt event failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_shared_receipt_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION reject_shared_receipt_event();`);
    await assert.rejects(approvePurchaseReceipt(f.db, actor, input), /receipt event failure/);
    assert.equal(await f.db.purchaseReceipt.count(), 0); assert.equal(await f.db.materialStock.count(), 0); assert.equal(await f.db.materialMovement.count(), 0);
    await f.pg.exec(`DROP TRIGGER reject_shared_receipt_event ON "ProcurementLifecycleEvent"; DROP FUNCTION reject_shared_receipt_event();`);
    const first = await approvePurchaseReceipt(f.db, actor, input);
    assert.equal((await approvePurchaseReceipt(f.db, actor, input)).id, first.id);
    await assert.rejects(approvePurchaseReceipt(f.db, actor, { ...input, items: [{ ...input.items[0], quantity: 5 }] }), /outros dados/);
    const concurrent = await Promise.allSettled([2, 3].map(index => approvePurchaseReceipt(f.db, actor, { ...input, number: `REC-TEST-${index}`, idempotencyKey: `receipt-test-${index}` })));
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    assert.equal((await f.db.materialStock.findFirstOrThrow({ where: { materialId: paperMaterial.id } })).quantity, 8);
    await approvePurchaseReceipt(f.db, actor, { ...input, number: "REC-TEST-4", idempotencyKey: "receipt-test-4", items: [{ ...input.items[0], quantity: 2 }] });
    assert.equal((await f.db.materialStock.findFirstOrThrow({ where: { materialId: paperMaterial.id } })).quantity, 10);
    await approvePurchaseReceipt(f.db, actor, { ...input, number: "REC-TEST-EQP", idempotencyKey: "receipt-test-eqp", items: [{ ...input.items[0], purchaseProcessItemId: "equipment-line", materialId: equipmentMaterial.id, quantity: 2 }] });
    assert.equal((await f.db.materialStock.findFirstOrThrow({ where: { materialId: equipmentMaterial.id } })).quantity, 2);
    await assert.rejects(approvePurchaseReceipt(f.db, actor, { ...input, number: "REC-SERVICE", idempotencyKey: "receipt-service", items: [{ ...input.items[0], purchaseProcessItemId: "service-line", quantity: 1 }] }), /deve corresponder/);
    assert.equal(await f.db.materialMovement.count({ where: { purchaseReceiptItem: { isNot: null } } }), 4);
  } finally {
    await f.close();
    if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
  }
});
