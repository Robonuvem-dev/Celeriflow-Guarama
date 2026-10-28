import assert from "node:assert/strict";
import { test } from "node:test";
import { count, eq } from "drizzle-orm";
import { materialStocks, materialStockValuations, materialStockValuationEvents, materialMovements, warehouses } from "@/db/schema/assets-stock";
import { costCenters } from "@/db/schema/master-data";
import { financialYears } from "@/db/schema/finance-years";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { users } from "@/db/schema/identity";
import { withDatabaseTransaction } from "@/db/transaction";
import { applyStockMovement, returnStockMovement } from "../stock-service";
import { reconcileStockValuation } from "../stock-valuation";
import { createAssetsFixture } from "./drizzle-fixture";

async function fixture() {
  const f = await createAssetsFixture([costCenters, financialYears, planningEntityUnits, documents, documentVersions, users]);
  try {
    await f.pg.exec(`CREATE TABLE "UsuarioUnidadeGestora" ("usuarioId" TEXT, "budgetUnitId" TEXT);
      CREATE TABLE "AccountingPlan" (id TEXT PRIMARY KEY, code TEXT);
      ALTER TABLE "AccountingTransaction" ADD COLUMN "sourceModule" TEXT, ADD COLUMN "sourceType" TEXT, ADD COLUMN "sourceId" TEXT, ADD COLUMN "eventType" TEXT;
      INSERT INTO "BudgetUnit" (id,"secretariatId") VALUES ('ug-1','secretariat-1');
      INSERT INTO "UsuarioUnidadeGestora" VALUES ('user-1','ug-1');
      INSERT INTO "AccountingPlan" VALUES ('inventory-account','1.1.5.6.1'),('consumption-account','3.3.1.6.1');`);
    await f.connection.db.insert(users).values({ id: "user-1", nome: "Responsável", email: "valuation@example.test", perfilId: "profile-1" });
    await f.connection.db.insert(financialYears).values({ id: "year-1", year: 2026, governmentEntityId: "entity-1", startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T23:59:59.999Z") });
    await f.connection.db.insert(planningEntityUnits).values({ budgetUnitId: "ug-1", governmentEntityId: "entity-1" });
    await f.connection.db.insert(costCenters).values({ id: "center-1", code: "CENTER-1", name: "Centro", governmentEntityId: "entity-1", secretariatId: "secretariat-1" });
    await f.connection.db.update(warehouses).set({ costCenterId: "center-1" }).where(eq(warehouses.id, "warehouse-1"));
    await f.connection.db.insert(materialStocks).values({ id: "stock-1", warehouseId: "warehouse-1", materialId: "material-1", quantity: 3, unitCost: 100 });
    await f.connection.db.insert(documents).values({ id: "document-1", title: "Conciliação de estoque", documentType: "ESTOQUE:entity-1:ug-1", fileUrl: "https://example.test/stock.pdf", status: "Válido" });
    await f.connection.db.insert(documentVersions).values({ id: "version-1", documentId: "document-1", versionNumber: 1, fileUrl: "https://example.test/stock.pdf", hashSha256: "a".repeat(64), status: "FINAL" });
    const actor = { usuarioId: "user-1", allowedBudgetUnitIds: ["ug-1"] };
    const opening = { stockId: "stock-1", financialYearId: "year-1", budgetUnitId: "ug-1", inventoryAccountId: "inventory-account", consumptionAccountId: "consumption-account", quantity: "3", amount: "0.10", documentVersionId: "version-1", reason: "Saldo inicial conciliado conforme documento de estoque" };
    const movement = { warehouseId: "warehouse-1", materialId: "material-1", actor };
    return { ...f, actor, opening, movement };
  } catch (error) { await f.close(); throw error; }
}

test("Drizzle valued stock conserves all cents through a full issue and successive partial returns", async () => {
  const f = await fixture();
  try {
    const position = await reconcileStockValuation(f.connection, f.actor, f.opening);
    assert.equal((await reconcileStockValuation(f.connection, f.actor, f.opening)).id, position.id);
    await assert.rejects(reconcileStockValuation(f.connection, f.actor, { ...f.opening, amount: "0.11" }), /já conciliada/);
    const issue = await withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, { ...f.movement, kind: "EXIT", quantity: 3, unitCost: 100 }));
    assert.equal(issue.movement.totalValueDecimal?.toFixed(2), "0.10");
    const returned: string[] = [];
    for (let index = 0; index < 3; index++) {
      const input = { movementId: issue.movement.id, quantity: 1, reason: "Material devolvido ao almoxarifado", idempotencyKey: `partial-return-${index}`, actor: f.actor };
      const correction = await returnStockMovement(f.connection, input);
      assert.equal((await returnStockMovement(f.connection, input)).id, correction.id);
      returned.push(correction.totalValueDecimal!.toFixed(2));
    }
    assert.deepEqual(returned, ["0.03", "0.04", "0.03"]);
    const [closing] = await f.connection.db.select().from(materialStockValuations);
    assert.equal(closing.amount.toFixed(2), "0.10");
    assert.equal(closing.quantity.toFixed(6), "3.000000");
    assert.equal(closing.version, 4);
    const events = await f.connection.db.select().from(materialStockValuationEvents);
    assert.deepEqual(events.map(event => event.sequence).sort(), [1, 2, 3, 4]);
    assert.ok(events.every(event => /^[a-f0-9]{64}$/.test(event.hash)));
  } finally { await f.close(); }
});

test("Drizzle valued stock serializes competing issues, rolls back both ledgers and enforces UG/document scope", async () => {
  const f = await fixture();
  try {
    await assert.rejects(reconcileStockValuation(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, f.opening), /autorizadas/);
    await f.connection.db.update(documents).set({ documentType: "ESTOQUE:other:ug-1" }).where(eq(documents.id, "document-1"));
    await assert.rejects(reconcileStockValuation(f.connection, f.actor, f.opening), /documento GED/);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].valuationEnabled, false);
    await f.connection.db.update(documents).set({ documentType: "ESTOQUE:entity-1:ug-1" }).where(eq(documents.id, "document-1"));
    await reconcileStockValuation(f.connection, f.actor, { ...f.opening, amount: "30.00" });
    await withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, { ...f.movement, kind: "ENTRY", quantity: 3, sourceType: "HEALTH_RECEIPT", unitCost: 30 }));
    const results = await Promise.allSettled([1, 2].map(() => withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, { ...f.movement, kind: "EXIT", quantity: 4 }))));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const success = results.find(result => result.status === "fulfilled");
    assert.equal(success?.status === "fulfilled" ? success.value.movement.totalValueDecimal?.toFixed(2) : null, "80.00");
    const [before] = await f.connection.db.select().from(materialStockValuations);
    assert.equal(before.quantity.toString(), "2");
    assert.equal(before.amount.toFixed(2), "40.00");
    const [{ total }] = await f.connection.db.select({ total: count() }).from(materialMovements);
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
      await applyStockMovement(tx, { ...f.movement, kind: "EXIT", quantity: 1 });
      throw new Error("Falha do produtor após a saída");
    }), /Falha do produtor/);
    assert.equal((await f.connection.db.select({ total: count() }).from(materialMovements))[0].total, total);
    const [after] = await f.connection.db.select().from(materialStockValuations);
    assert.equal(after.quantity.toString(), before.quantity.toString());
    assert.equal(after.amount.toString(), before.amount.toString());
    assert.equal(after.version, before.version);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 2);
    await assert.rejects(withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, { ...f.movement, actor: { ...f.actor, allowedBudgetUnitIds: [] }, kind: "EXIT", quantity: 1 })), /UGs autorizadas/);
    await assert.rejects(withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, { ...f.movement, kind: "ENTRY", quantity: 1, sourceType: "HEALTH_RECEIPT" })), /preço documental/);
  } finally { await f.close(); }
});
