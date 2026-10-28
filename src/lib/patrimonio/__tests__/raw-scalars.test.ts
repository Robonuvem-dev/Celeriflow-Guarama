import assert from "node:assert/strict";
import { test } from "node:test";
import { Decimal } from "@/db/decimal";
import { financialYears } from "@/db/schema/finance-years";
import { accountingEntries, monthlyAccountingCloses } from "@/db/schema/finance-accounting";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { assets, assetValueAdjustments } from "@/db/schema/assets";
import { materialMovements, materialStocks, materialStockValuations } from "@/db/schema/assets-stock";
import { withDatabaseTransaction } from "@/db/transaction";
import { postStockConsumptionAccounting } from "../stock-consumption-accounting";
import { reverseAssetValuation } from "../valuation-reversal";
import { createAssetsFixture } from "./drizzle-fixture";

const context = { actor: { usuarioId: "user-1", employeeId: "employee-1", allowedBudgetUnitIds: ["ug-1"] }, budgetUnitId: "ug-1" };

async function fixture() {
  const f = await createAssetsFixture([financialYears, monthlyAccountingCloses, planningEntityUnits, accountingEntries]);
  try {
    await f.pg.exec(`ALTER TABLE "AccountingTransaction"
        ADD COLUMN "governmentEntityId" TEXT, ADD COLUMN "budgetUnitId" TEXT, ADD COLUMN "financialYearId" TEXT,
        ADD COLUMN date TIMESTAMP(3), ADD COLUMN history TEXT, ADD COLUMN status TEXT,
        ADD COLUMN "sourceModule" TEXT, ADD COLUMN "sourceType" TEXT, ADD COLUMN "sourceId" TEXT,
        ADD COLUMN "eventType" TEXT, ADD COLUMN "idempotencyKey" TEXT,
        ADD COLUMN "authorUsuarioId" TEXT, ADD COLUMN "authorEmployeeId" TEXT,
        ADD COLUMN "postedAt" TIMESTAMP(3), ADD COLUMN "createdAt" TIMESTAMP(3), ADD COLUMN "updatedAt" TIMESTAMP(3);
      INSERT INTO "BudgetUnit" VALUES ('ug-1','secretariat-1');
      INSERT INTO "Department" (id,name,"secretariatId") VALUES ('department-1','Patrimônio','secretariat-1');`);
    await f.connection.db.insert(financialYears).values({ id: "year-1", year: 2026, governmentEntityId: "entity-1", status: "Aberto", startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T23:59:59.999Z") });
    await f.connection.db.insert(planningEntityUnits).values({ budgetUnitId: "ug-1", governmentEntityId: "entity-1" });
    return f;
  } catch (error) { await f.close(); throw error; }
}

test("raw valuation replay preserves all Date fields, nullable postedAt and millisecond chronology", async () => {
  const f = await fixture();
  try {
    await f.connection.db.insert(assets).values({ id: "asset-1", patrimonyNumber: "PAT00001", name: "Equipamento", categoryId: "asset-category", departmentId: "department-1", budgetUnitId: "ug-1", acquisitionDate: new Date("2026-01-01T00:00:00Z"), acquisitionValue: 100, currentValue: 100 });
    await f.connection.db.insert(assetValueAdjustments).values({ id: "adjustment-1", type: "SUBSEQUENT_COST", date: new Date("2026-10-28T12:30:00.123Z"), openingValue: 100, adjustmentValue: 0.01, closingValue: 100.01, openingValueDecimal: new Decimal("100.00"), adjustmentValueDecimal: new Decimal("0.01"), closingValueDecimal: new Decimal("100.01"), accountingTransactionId: "original-1", justification: "Custo subsequente fundamentado", evidence: "Documento municipal", assetId: "asset-1" });
    await f.pg.exec(`INSERT INTO "AccountingTransaction" (id,"governmentEntityId","budgetUnitId","financialYearId",date,history,status,"sourceModule","sourceType","sourceId","eventType","idempotencyKey","authorUsuarioId","authorEmployeeId","postedAt","reversalOfId","createdAt","updatedAt") VALUES
      ('original-1','entity-1','ug-1','year-1','2026-10-28 12:30:00.123','Custo subsequente','POSTADO','PATRIMONIO','ASSET_VALUATION','asset-1','ASSET_SUBSEQUENT_COST',NULL,'user-1',NULL,NULL,NULL,'2026-10-28 00:01:00.456','2026-10-28 00:02:00.789'),
      ('reversal-1','entity-1','ug-1','year-1','2026-10-28 12:30:00.124','Estorno fundamentado do custo','POSTADO','PATRIMONIO','ASSET_VALUATION_REVERSAL','asset-1','ASSET_VALUATION_REVERSED','PATRIMONIO:VALUATION_REVERSAL:reverse-1','user-1','employee-1','2026-10-28 00:03:00.321','original-1','2026-10-28 00:04:00.654','2026-10-28 00:05:00.987');`);
    const input = { kind: "ADJUSTMENT" as const, recordId: "adjustment-1", date: new Date("2026-10-28T12:30:00.124Z"), reason: "Estorno fundamentado do custo", idempotencyKey: "reverse-1" };
    const replay = await reverseAssetValuation(f.connection, context, input);
    assert.equal(replay.id, "reversal-1");
    assert.equal(replay.date.toISOString(), "2026-10-28T12:30:00.124Z");
    assert.equal(replay.postedAt?.toISOString(), "2026-10-28T00:03:00.321Z");
    assert.equal(replay.createdAt.toISOString(), "2026-10-28T00:04:00.654Z");
    assert.equal(replay.updatedAt.toISOString(), "2026-10-28T00:05:00.987Z");
    await assert.rejects(reverseAssetValuation(f.connection, context, { ...input, date: new Date("2026-10-28T12:30:00.122Z") }), /Partida\/data do estorno diverge/);
    await assert.rejects(reverseAssetValuation(f.connection, context, { ...input, date: new Date("2026-10-28T12:30:00.125Z") }), /outros dados/);
    await f.pg.exec(`UPDATE "AccountingTransaction" SET "postedAt"=NULL WHERE id='reversal-1'`);
    assert.equal((await reverseAssetValuation(f.connection, context, input)).postedAt, null);
    assert.equal((await f.connection.db.select().from(assetValueAdjustments)).length, 1);
    assert.equal((await f.connection.db.select().from(accountingEntries)).length, 0);
  } finally { await f.close(); }
});

test("raw settlement chronology blocks one millisecond early and preserves the exact-time accounting gate", async () => {
  const f = await fixture();
  try {
    await f.pg.exec(`ALTER TABLE "Settlement" ADD COLUMN date TIMESTAMP(3), ADD COLUMN "commitmentId" TEXT;
      ALTER TABLE "Commitment" ADD COLUMN "purchaseReceiptId" TEXT, ADD COLUMN "reservationId" TEXT;
      ALTER TABLE "BudgetAppropriation" ADD COLUMN "financialYearId" TEXT, ADD COLUMN "expenseNatureId" TEXT;
      CREATE TABLE "ExpenseNature" (id TEXT PRIMARY KEY, code TEXT);
      CREATE TABLE "BudgetReservation" (id TEXT PRIMARY KEY, "expenseId" TEXT);
      CREATE TABLE "Expense" (id TEXT PRIMARY KEY, "sourceType" TEXT);
      INSERT INTO "ExpenseNature" VALUES ('nature-1','3.3.90.30');
      INSERT INTO "BudgetAppropriation" VALUES ('budget-1','ug-1','year-1','nature-1');
      INSERT INTO "Commitment" (id,"appropriationId") VALUES ('commitment-1','budget-1');
      INSERT INTO "Settlement" VALUES ('settlement-1','Liquidado','2026-10-28 12:30:00.123','commitment-1');`);
    await f.connection.db.insert(materialStocks).values({ id: "stock-1", materialId: "material-1", warehouseId: "warehouse-1", quantity: 1, valuationEnabled: true });
    await f.connection.db.insert(materialStockValuations).values({ stockId: "stock-1", governmentEntityId: "entity-1", budgetUnitId: "ug-1", inventoryAccountId: "inventory-1", consumptionAccountId: "consumption-1", quantity: new Decimal(1), amount: new Decimal("0.01"), openingQuantity: new Decimal(1), openingAmount: new Decimal("0.01"), openingEvidence: { documentVersionId: "version-1" }, openingHash: "a".repeat(64), createdByUsuarioId: "user-1" });
    const [movement] = await f.connection.db.insert(materialMovements).values({ type: "Saída", operation: "REGULAR", quantity: 1, quantityDecimal: new Decimal(1), unitValueDecimal: new Decimal("0.01"), totalValueDecimal: new Decimal("0.01"), date: new Date("2026-10-28T12:30:00.122Z"), reason: "CONSUMO_ORCAMENTARIO_DIRETO", stockId: "stock-1", materialId: "material-1", warehouseId: "warehouse-1", settlementId: "settlement-1" }).returning();
    await assert.rejects(withDatabaseTransaction(f.connection, tx => postStockConsumptionAccounting(tx, context.actor, movement)), /Consumo não pode antecipar a liquidação/);
    await assert.rejects(withDatabaseTransaction(f.connection, tx => postStockConsumptionAccounting(tx, context.actor, { ...movement, date: new Date("2026-10-28T12:30:00.123Z") })), /Liquidação deve comprovar reconhecimento Decimal/);
    assert.equal((await f.connection.db.select().from(accountingEntries)).length, 0);
  } finally { await f.close(); }
});
