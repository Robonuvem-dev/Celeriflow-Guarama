import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { approvePurchaseRequest, approvePurchaseReceipt, createPurchaseProcessFromApprovedRequests } from "../src/lib/compras/procurement-lifecycle";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations, procurementLifecycleEvents } from "../src/db/schema/procurement-requests";
import { purchaseProcesses, purchaseProcessItems, procurementContracts } from "../src/db/schema/procurement-core";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Compras: aprovação, formação e replay respeitam UG/ente (${jurisdiction})`, async () => {
    const f = await createProcurementWorkflowFixture(jurisdiction);
    const db = f.connection.db;
    try {
      await f.database.exec(`INSERT INTO "MaterialCategory" (id, code, name) VALUES ('cat', 'CAT', 'Materiais'); INSERT INTO "Material" (id, code, name, "categoryId") VALUES ('papel', 'MAT1', 'Papel A4', 'cat');`);
      const authorized = f.actor;
      const other = { ...authorized, allowedBudgetUnitIds: ["ug-restrita"] };
      const [request] = await db.insert(purchaseRequests).values({ number: "SUP-2026-001", object: "Material de expediente", justification: "Reposição administrativa", secretariatId: "secretaria", departmentId: "setor", requesterId: "servidora-ana", estimatedValue: 10 }).returning();
      const [item] = await db.insert(purchaseRequestItems).values({ purchaseRequestId: request.id, customName: "Papel A4", materialId: "papel", quantity: 1, estimatedUnitValue: 10 }).returning();
      await db.insert(purchaseRequestBudgetAllocations).values({ purchaseRequestItemId: item.id, budgetAppropriationId: f.appropriationId, quantity: 1, valueDecimal: "10" });
      await assert.rejects(approvePurchaseRequest(f.connection, other, request.id), /unidades gestoras autorizadas/);
      assert.equal((await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, request.id)))[0].status, "Rascunho");
      await assert.rejects(approvePurchaseRequest(f.connection, { ...authorized, employeeId: request.requesterId }, request.id), /própria solicitação/);
      await approvePurchaseRequest(f.connection, authorized, request.id);
      await assert.rejects(approvePurchaseRequest(f.connection, other, request.id), /unidades gestoras autorizadas/);
      const input = { purchaseRequestIds: [request.id], number: "PROC-SUP-001", type: "Comum", idempotencyKey: "procurement-scope-process" };
      await assert.rejects(createPurchaseProcessFromApprovedRequests(f.connection, other, input), /unidades gestoras autorizadas/);
      assert.equal((await db.select().from(purchaseProcesses)).length, 0);
      const process = await createPurchaseProcessFromApprovedRequests(f.connection, authorized, input);
      assert.equal((await createPurchaseProcessFromApprovedRequests(f.connection, authorized, input)).id, process.id);
      await assert.rejects(createPurchaseProcessFromApprovedRequests(f.connection, other, input), /unidades gestoras autorizadas/);
      const [processItem] = await db.select().from(purchaseProcessItems).where(eq(purchaseProcessItems.purchaseProcessId, process.id));
      const [contract] = await db.insert(procurementContracts).values({ number: "CT-SUP-001", object: "Material de expediente", initialValue: 10, updatedValue: 10, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "Vigente", processId: process.id, supplierId: "fornecedor", secretariatId: "secretaria", sourceBudgetUnitId: "ug" }).returning();
      const receiptInput = { number: "REC-SUP-001", receivedAt: new Date("2026-10-01"), contractId: contract.id, documentId: "documento-fiscal", receiverId: "recebedor", attesterId: "aprovadora", idempotencyKey: "receipt-scope", items: [{ purchaseProcessItemId: processItem.id, materialId: "papel", warehouseId: "central", quantity: 1, unitCost: 10 }] };
      await assert.rejects(approvePurchaseReceipt(f.connection, other, receiptInput), /unidades gestoras autorizadas/);
      const receipt = await approvePurchaseReceipt(f.connection, authorized, receiptInput);
      assert.equal((await approvePurchaseReceipt(f.connection, authorized, receiptInput)).id, receipt.id);
      await assert.rejects(approvePurchaseReceipt(f.connection, other, receiptInput), /unidades gestoras autorizadas/);
      await f.database.exec(`INSERT INTO "Secretariat" VALUES ('outro-setor', 'Outra secretaria')`);
      await db.update(purchaseRequests).set({ secretariatId: "outro-setor" }).where(eq(purchaseRequests.id, request.id));
      await assert.rejects(approvePurchaseRequest(f.connection, authorized, request.id), /UG\/ente conciliados/);
      await db.update(purchaseRequests).set({ secretariatId: "secretaria" }).where(eq(purchaseRequests.id, request.id));
      await db.delete(purchaseRequestBudgetAllocations).where(eq(purchaseRequestBudgetAllocations.purchaseRequestItemId, item.id));
      await assert.rejects(approvePurchaseRequest(f.connection, authorized, request.id), /UG\/ente conciliados/);
      assert.equal((await db.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PURCHASE_REQUEST_APPROVED"))).length, 1);
    } finally { await f.close(); }
  });
}
