import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { loadContractHeader } from "../src/db/repositories/procurement/instruments";
import { listPurchasePlannings } from "../src/db/repositories/procurement/purchase-planning";

test("procurement typed readers decode timestamp/date, nullable relations and exact numeric without the host timezone", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`
      CREATE TABLE "PurchasePlanning" (id text PRIMARY KEY, description text, "catalogItemId" text REFERENCES "CatalogItem", "originPurchaseRequestId" text REFERENCES "PurchaseRequest", unit text NOT NULL, quantity float8 NOT NULL, "expectedPeriodStart" date NOT NULL, "expectedPeriodEnd" date NOT NULL, "estimatedValueDecimal" numeric(18,2) NOT NULL, status text NOT NULL DEFAULT 'Rascunho', "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      INSERT INTO "PurchasePlanning" (id, description, unit, quantity, "expectedPeriodStart", "expectedPeriodEnd", "estimatedValueDecimal", "createdAt", "updatedAt") VALUES ('planning', 'Necessidade de serviço', 'H', 1, '2026-10-01', '2026-10-31', 90071992547409.93, '2026-09-01 12:34:56.123', '2026-09-02 03:04:05.678');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId") VALUES ('proc', 'PROC', 'Serviço', 'Comum', 'secretaria');
      INSERT INTO "Contract" (id, number, object, "initialValue", "updatedValue", "startDate", "endDate", status, "processId", "supplierId", "secretariatId") VALUES ('contract', 'CT', 'Serviço', 0.30, 0.30, '2026-10-01 12:34:56.123', '2026-12-31 23:59:59.999', 'Vigente', 'proc', 'fornecedor', 'secretaria');
    `);
    const db = f.connection.db;
    const [planning] = await listPurchasePlannings(db, "planning");
    assert.equal(planning.expectedPeriodStart.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(planning.expectedPeriodEnd.toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(planning.createdAt.toISOString(), "2026-09-01T12:34:56.123Z");
    assert.equal(planning.updatedAt.toISOString(), "2026-09-02T03:04:05.678Z");
    assert.equal(planning.estimatedValueDecimal.toFixed(2), "90071992547409.93");
    assert.equal(planning.catalogItem, null);
    assert.equal(planning.originPurchaseRequest, null);
    const contract = await loadContractHeader(db, "contract");
    assert.ok(contract);
    assert.equal(contract.startDate.toISOString(), "2026-10-01T12:34:56.123Z");
    assert.equal(contract.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
    assert.equal(contract.managerId, null);
  } finally { await f.close(); }
});
