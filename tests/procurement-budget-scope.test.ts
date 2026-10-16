import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { approvePurchaseRequest, approvePurchaseReceipt, createPurchaseProcessFromApprovedRequests } from "../src/lib/compras/procurement-lifecycle";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Compras: aprovação, formação e replay respeitam a origem orçamentária (${jurisdiction})`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      await f.db.employee.create({ data: { id: "aprovadora", name: "Beatriz Oliveira", secretariatId: "secretaria" } });
      const authorized = { usuarioId: "beatriz", employeeId: "aprovadora", allowedBudgetUnitIds: ["ug"] };
      const other = { ...authorized, allowedBudgetUnitIds: ["ug-restrita"] };
      const line = await f.db.planningBudgetLine.findUniqueOrThrow({ where: { id: f.e1 } });
      const request = await f.db.purchaseRequest.create({ data: {
        id: "pedido-suprimentos", number: "SUP-2026-001", object: "Material de expediente", justification: "Reposição administrativa",
        secretariatId: "secretaria", departmentId: "setor", requesterId: "servidora-ana", estimatedValue: 10,
        items: { create: { id: "item-suprimentos", customName: "Papel A4", quantity: 1, estimatedUnitValue: 10,
          budgetAllocations: { create: { budgetAppropriationId: line.appropriationId!, quantity: 1, valueDecimal: "10" } },
        } },
      } });
      await assert.rejects(approvePurchaseRequest(f.db, other, request.id), /unidades gestoras autorizadas/);
      assert.equal((await f.db.purchaseRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "Rascunho");
      await assert.rejects(approvePurchaseRequest(f.db, { ...authorized, employeeId: request.requesterId }, request.id), /própria solicitação/);
      await approvePurchaseRequest(f.db, authorized, request.id);
      await assert.rejects(approvePurchaseRequest(f.db, other, request.id), /unidades gestoras autorizadas/, "O replay não pode liberar dados depois de perda de acesso.");
      const input = { purchaseRequestIds: [request.id], number: "PROC-SUP-001", type: "Comum", idempotencyKey: "procurement-scope-process" };
      await assert.rejects(createPurchaseProcessFromApprovedRequests(f.db, other, input), /unidades gestoras autorizadas/);
      assert.equal(await f.db.purchaseProcess.count(), 0);
      const process = await createPurchaseProcessFromApprovedRequests(f.db, authorized, input);
      assert.equal((await createPurchaseProcessFromApprovedRequests(f.db, authorized, input)).id, process.id);
      await assert.rejects(createPurchaseProcessFromApprovedRequests(f.db, other, input), /unidades gestoras autorizadas/);
      assert.equal(await f.db.purchaseProcess.count(), 1);

      await f.db.contract.create({ data: { id: "contrato-scope", number: "CT-SUP-001", object: "Material de expediente", initialValue: 10, updatedValue: 10,
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "Vigente", processId: process.id, supplierId: "fornecedor", secretariatId: "secretaria" } });
      await f.db.document.create({ data: { id: "doc-scope", title: "Documento da fixture isolada", documentType: "Recebimento", fileUrl: "https://fixture.invalid/documento", status: "Válido" } });
      await f.db.employee.create({ data: { id: "recebedor", name: "Carlos Pereira", isActive: true } });
      const receiptInput = { number: "REC-SUP-001", receivedAt: new Date("2026-10-01"), contractId: "contrato-scope", documentId: "doc-scope",
        receiverId: "recebedor", attesterId: "aprovadora", idempotencyKey: "receipt-scope",
        items: [{ purchaseProcessItemId: "item-processo", materialId: "papel", warehouseId: "central", quantity: 1, unitCost: 10 }],
      };
      await assert.rejects(approvePurchaseReceipt(f.db, other, receiptInput), /unidades gestoras autorizadas/);
      assert.equal(await f.db.purchaseReceipt.count(), 0);
      await f.db.purchaseReceipt.create({ data: { id: "rec-scope", number: receiptInput.number, receivedAt: receiptInput.receivedAt,
        contractId: receiptInput.contractId, documentId: receiptInput.documentId, receiverId: receiptInput.receiverId, attesterId: receiptInput.attesterId,
        purchaseProcessId: process.id, idempotencyKey: receiptInput.idempotencyKey, sourceId: receiptInput.contractId } });
      assert.equal((await approvePurchaseReceipt(f.db, authorized, receiptInput)).id, "rec-scope");
      await assert.rejects(approvePurchaseReceipt(f.db, other, receiptInput), /unidades gestoras autorizadas/);

      await f.db.purchaseRequest.update({ where: { id: request.id }, data: { secretariatId: "outro-setor" } });
      await assert.rejects(approvePurchaseRequest(f.db, authorized, request.id), /UG\/ente conciliados/);
      await f.db.purchaseRequest.update({ where: { id: request.id }, data: { secretariatId: "secretaria" } });
      await f.db.purchaseRequestItemBudgetAllocation.deleteMany({ where: { purchaseRequestItemId: "item-suprimentos" } });
      await assert.rejects(approvePurchaseRequest(f.db, authorized, request.id), /UG\/ente conciliados/);
      assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PURCHASE_REQUEST_APPROVED" } }), 1);
    } finally { await f.close(); }
  });
}
