import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { approvePurchaseReceiptInTransaction } from "../src/lib/compras/procurement-lifecycle";
import { deriveExpenseAuthorizationsForContract, recordPurchaseReceiptLiquidationAuthorization, recordInstrumentMeasurementLiquidationAuthorization, cancelInstrumentMeasurementLiquidationAuthorization } from "../src/lib/compras/procurement-finance-bridge";
import { purchaseReceipts, procurementLifecycleEvents } from "../src/db/schema/procurement-requests";
import { materialMovements, materialStocks } from "../src/db/schema/assets-stock";
import { instrumentMeasurements } from "../src/db/schema/procurement-instruments";

test("receipt, physical stock and AL roll back together when the final authorization fails", async () => {
  const f = await createProcurementWorkflowFixture();
  const actor = { usuarioId: "beatriz", employeeId: "aprovadora" };
  try {
    await f.database.exec(`
      INSERT INTO "MaterialCategory" (id, code, name) VALUES ('cat', 'CAT', 'Materiais');
      INSERT INTO "Material" (id, code, name, "categoryId") VALUES ('papel', 'MAT1', 'Papel', 'cat');
      INSERT INTO "PurchaseRequest" (id, number, object, justification, status, "secretariatId", "departmentId", "requesterId") VALUES ('req', 'REQ', 'Material', 'Reposição', 'Aprovada', 'secretaria', 'setor', 'servidora-ana');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId", "purchaseRequestId") VALUES ('proc', 'PROC', 'Material', 'Comum', 'secretaria', 'req');
      INSERT INTO "PurchaseProcessItem" (id, "purchaseProcessId", quantity, "materialId") VALUES ('item', 'proc', 3, 'papel');
      INSERT INTO "Contract" (id, number, object, "initialValue", "updatedValue", "startDate", "endDate", status, "processId", "supplierId", "secretariatId") VALUES ('ct', 'CT', 'Material', 0.30, 0.30, '2026-01-01', '2026-12-31', 'Vigente', 'proc', 'fornecedor', 'secretaria');
      CREATE FUNCTION reject_final_al() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'PROCUREMENT_LIQUIDATION_AUTHORIZATION_CREATED' THEN RAISE EXCEPTION 'injected final AL failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_final_al BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION reject_final_al();
    `);
    const input = { number: "REC", receivedAt: new Date("2026-10-01"), contractId: "ct", documentId: "documento-fiscal", receiverId: "recebedor", attesterId: "aprovadora", idempotencyKey: "receipt-with-al", items: [{ purchaseProcessItemId: "item", materialId: "papel", warehouseId: "central", quantity: 3, unitCost: 0.1 }] };
    const approve = () => withDatabaseTransaction(f.connection, async tx => {
      const receipt = await approvePurchaseReceiptInTransaction(tx, actor, input);
      const authorization = await recordPurchaseReceiptLiquidationAuthorization(tx, actor, receipt.id);
      return { receipt, authorization };
    });
    await assert.rejects(approve(), error => {
      let cause: unknown = error;
      const seen = new Set<unknown>();
      while (cause instanceof Error && !seen.has(cause)) {
        if (cause.message.includes("injected final AL failure")) return true;
        seen.add(cause);
        cause = cause.cause;
      }
      return false;
    });
    const db = f.connection.db;
    assert.equal((await db.select().from(purchaseReceipts)).length, 0);
    assert.equal((await db.select().from(materialStocks)).length, 0);
    assert.equal((await db.select().from(materialMovements)).length, 0);
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 0);
    await f.database.exec('DROP TRIGGER reject_final_al ON "ProcurementLifecycleEvent"; DROP FUNCTION reject_final_al();');
    const confirmed = await approve();
    assert.equal(confirmed.receipt.receivedAt.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(confirmed.authorization?.valueDecimal.toFixed(2), "0.30");
    const replay = await approve();
    assert.equal(replay.receipt.id, confirmed.receipt.id);
    assert.equal(replay.authorization?.eventId, confirmed.authorization?.eventId);
    assert.equal((await db.select().from(materialMovements)).length, 1);
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 2);
  } finally { await f.close(); }
});

test("expense authorization replay checks the current UG scope before reusing a financial fact", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`
      CREATE TABLE "Expense" (id text PRIMARY KEY, date timestamp NOT NULL, description text NOT NULL, value float8 NOT NULL, "valueDecimal" numeric(18,2), "appropriationId" text NOT NULL REFERENCES "BudgetAppropriation", "secretariatId" text NOT NULL REFERENCES "Secretariat", "supplierId" text REFERENCES "Supplier", "requestedById" text REFERENCES "Usuario", "approvedById" text REFERENCES "Usuario", "approvedAt" timestamp, status text NOT NULL DEFAULT 'Solicitada', "sourceModule" text NOT NULL, "sourceType" text NOT NULL, "sourceId" text, "eventType" text NOT NULL, "idempotencyKey" text UNIQUE, "purchaseReceiptId" text REFERENCES "PurchaseReceipt", "socialProgramId" text, "socialBenefitId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      INSERT INTO "PurchaseRequest" (id, number, object, justification, status, "secretariatId", "departmentId", "requesterId") VALUES ('req', 'REQ', 'Serviço', 'Necessidade', 'Aprovada', 'secretaria', 'setor', 'servidora-ana');
      INSERT INTO "PurchaseRequestItem" (id, "purchaseRequestId", quantity) VALUES ('req-item', 'req', 1);
      INSERT INTO "PurchaseRequestItemBudgetAllocation" (id, "purchaseRequestItemId", "budgetAppropriationId", quantity, "valueDecimal") VALUES ('allocation', 'req-item', 'dotacao', 1, 0.30);
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId", "purchaseRequestId") VALUES ('proc', 'PROC', 'Serviço', 'Comum', 'secretaria', 'req');
      INSERT INTO "PurchaseProcessItem" (id, "purchaseProcessId", quantity) VALUES ('item', 'proc', 1);
      INSERT INTO "Contract" (id, number, object, "initialValue", "updatedValue", "startDate", "endDate", status, "processId", "supplierId", "secretariatId", "sourceBudgetUnitId") VALUES ('ct', 'CT', 'Serviço', 0.30, 0.30, '2026-01-01', '2026-12-31', 'Vigente', 'proc', 'fornecedor', 'secretaria', 'ug');
      INSERT INTO "Expense" (id, date, description, value, "valueDecimal", "appropriationId", "secretariatId", "supplierId", "sourceModule", "sourceType", "sourceId", "eventType", "idempotencyKey") VALUES ('ae', '2026-09-01', 'AE CT', 0.30, 0.30, 'dotacao', 'secretaria', 'fornecedor', 'COMPRAS', 'CONTRACT', 'ct', 'PROCUREMENT_EXPENSE_AUTHORIZATION_CREATED', 'C5:PROCUREMENT_FINANCE:AE:CONTRACT:ct:dotacao');
    `);
    const derive = (allowedBudgetUnitIds: string[]) => deriveExpenseAuthorizationsForContract(f.connection, { ...f.actor, allowedBudgetUnitIds }, "ct", new Date("2026-09-01"));
    await assert.rejects(derive([]), /unidades autorizadas/i);
    assert.equal((await f.connection.db.select().from(procurementLifecycleEvents)).length, 0);
    const [confirmed] = await derive(["ug"]);
    assert.equal(confirmed.expenseId, "ae");
    assert.equal(confirmed.valueDecimal.toFixed(2), "0.30");
    assert.equal((await derive(["ug"]))[0].eventId, confirmed.eventId);
    await assert.rejects(derive(["other-ug"]), /unidades autorizadas/i);
    assert.equal((await f.connection.db.select().from(procurementLifecycleEvents)).length, 1);
  } finally { await f.close(); }
});

test("measurement attestation/cancellation and append-only AL observe the supplied transaction", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`CREATE TABLE "InstrumentMeasurement" (id text PRIMARY KEY, "contractId" text, "covenantId" text, number integer NOT NULL, description text, "periodStart" timestamp, "periodEnd" timestamp, "measuredAt" timestamp NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'Rascunho', quantity float8, unit text, "valueDecimal" numeric(18,2) NOT NULL, "documentId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      INSERT INTO "InstrumentMeasurement" (id, "covenantId", number, "valueDecimal") VALUES ('measurement', 'covenant', 1, 90071992547409.93);`);
    const actor = f.actor;
    const rollback = new Error("rollback authorization owner");
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
      await tx.update(instrumentMeasurements).set({ status: "Atestada" }).where(eq(instrumentMeasurements.id, "measurement"));
      assert.equal((await recordInstrumentMeasurementLiquidationAuthorization(tx, actor, "measurement"))?.valueDecimal.toFixed(2), "90071992547409.93");
      throw rollback;
    }), error => error === rollback);
    const db = f.connection.db;
    assert.equal((await db.select().from(instrumentMeasurements))[0].status, "Rascunho");
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 0);
    await withDatabaseTransaction(f.connection, async tx => {
      await tx.update(instrumentMeasurements).set({ status: "Atestada" }).where(eq(instrumentMeasurements.id, "measurement"));
      const authorization = await recordInstrumentMeasurementLiquidationAuthorization(tx, actor, "measurement");
      assert.equal((await recordInstrumentMeasurementLiquidationAuthorization(tx, actor, "measurement"))?.eventId, authorization?.eventId);
      await tx.update(instrumentMeasurements).set({ status: "Cancelada" }).where(eq(instrumentMeasurements.id, "measurement"));
      await cancelInstrumentMeasurementLiquidationAuthorization(tx, actor, "measurement");
    });
    assert.equal((await db.select().from(procurementLifecycleEvents)).length, 2);
    assert.equal((await db.select().from(instrumentMeasurements))[0].status, "Cancelada");
  } finally { await f.close(); }
});
