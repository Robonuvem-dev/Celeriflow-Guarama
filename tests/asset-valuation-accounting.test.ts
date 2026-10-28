import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { departments } from "../src/db/schema/administration";
import { assets, assetCategories, assetValueAdjustments, assetValueHistories } from "../src/db/schema/assets";
import { accountingEvents, accountingRules, accountingTransactions } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { createAssetsAccountingFixture } from "./helpers/assets-accounting-fixture";
import { depreciateAssetsForMonth, recordAssetValueAdjustment } from "../src/lib/patrimonio/asset-lifecycle";
import { reverseAssetValuation } from "../src/lib/patrimonio/valuation-reversal";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P4: depreciação atômica, Decimal, concorrência e ajustes rastreáveis (${jurisdiction})`, async () => {
    const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    let fixture: Awaited<ReturnType<typeof createAssetsAccountingFixture>> | undefined;
    try {
      const f = fixture = await createAssetsAccountingFixture(jurisdiction);
      const readAsset = async () => (await f.db.select().from(assets).where(eq(assets.id, "asset-a")))[0];
      const historyCount = async () => (await f.db.select({ total: count() }).from(assetValueHistories))[0].total;
      const adjustmentCount = async () => (await f.db.select({ total: count() }).from(assetValueAdjustments))[0].total;
      await f.db.insert(departments).values({ id: "asset-department", name: "Patrimônio municipal", secretariatId: "secretaria", isActive: true });
      for (const id of ["category-a", "category-b"]) await f.db.insert(assetCategories).values({ id, code: id, name: id, lifeSpan: 3, isActive: true });
      for (const [id, categoryId] of [["asset-a", "category-a"], ["asset-b", "category-b"]]) await f.db.insert(assets).values({
        id, patrimonyNumber: id, name: id, categoryId, departmentId: "asset-department", budgetUnitId: "ug", acquisitionDate: new Date("2026-09-10T12:00:00Z"), acquisitionValue: 100, currentValue: 100, acquisitionValueDecimal: new Decimal("100.00"), currentValueDecimal: new Decimal("100.00"),
      });
      const rule = async (code: string) => {
        const [event] = await f.db.insert(accountingEvents).values({ code, name: code }).returning({ id: accountingEvents.id });
        await f.db.insert(accountingRules).values({ eventId: event.id, debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      };
      await rule("ASSET_DEPRECIATION:category-a");
      const context = { actor: f.actor, budgetUnitId: "ug" };
      const month = new Date("2026-09-01T12:00:00Z");
      await assert.rejects(depreciateAssetsForMonth(f.connection, month, context));
      assert.equal(await historyCount(), 0);
      assert.equal((await f.db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceModule, "PATRIMONIO")))[0].total, 0);
      assert.equal((await readAsset()).currentValueDecimal!.toFixed(2), "100.00");
      await rule("ASSET_DEPRECIATION:category-b");
      const results = await Promise.all([depreciateAssetsForMonth(f.connection, month, context), depreciateAssetsForMonth(f.connection, month, context)]);
      assert.equal(results.reduce((sum, result) => sum + result.processed, 0), 2);
      assert.equal(await historyCount(), 2);
      const [row] = await f.db.select({ history: assetValueHistories, accountingTransaction: accountingTransactions }).from(assetValueHistories).innerJoin(accountingTransactions, eq(accountingTransactions.id, assetValueHistories.accountingTransactionId)).where(eq(assetValueHistories.assetId, "asset-a"));
      const history = { ...row.history, accountingTransaction: row.accountingTransaction };
      assert.equal(history.depreciationDecimal!.toFixed(2), "33.33");
      assert.equal(history.closingValueDecimal!.toFixed(2), "66.67");
      assert.equal(history.accountingTransaction!.budgetUnitId, "ug");
      assert.equal(history.accountingTransaction!.date.toISOString(), "2026-09-30T12:00:00.000Z");
      await assert.rejects(depreciateAssetsForMonth(f.connection, month, { ...context, actor: { ...f.actor, allowedBudgetUnitIds: [] } }), /autorizadas/);
      const input = { assetId: "asset-a", date: new Date("2026-10-01T12:00:00Z"), type: "SUBSEQUENT_COST" as const, value: 0.01, justification: "Custo subsequente fundamentado", evidence: "Documento municipal preservado", idempotencyKey: "cost-a" };
      await assert.rejects(recordAssetValueAdjustment(f.connection, input, context));
      assert.equal(await adjustmentCount(), 0);
      assert.equal((await readAsset()).currentValueDecimal!.toFixed(2), "66.67");
      await rule("ASSET_SUBSEQUENT_COST:category-a");
      const adjustments = await Promise.all([recordAssetValueAdjustment(f.connection, input, context), recordAssetValueAdjustment(f.connection, input, context)]);
      assert.equal(adjustments[0].id, adjustments[1].id);
      assert.ok(adjustments[0].accountingTransactionId);
      assert.equal(await adjustmentCount(), 1);
      const asset = await readAsset();
      assert.equal(asset.currentValueDecimal!.toFixed(2), "66.68");
      assert.equal(asset.acquisitionValueDecimal!.toFixed(2), "100.01");
      await assert.rejects(recordAssetValueAdjustment(f.connection, { ...input, value: 0.02 }, context), /outros dados/);
      await assert.rejects(recordAssetValueAdjustment(f.connection, { ...input, date: new Date("2026-09-20T00:00:00Z"), idempotencyKey: "backdated" }, context), /última competência/);
      const reversalInput = { kind: "ADJUSTMENT" as const, recordId: adjustments[0].id, date: new Date("2026-10-02T12:00:00Z"), reason: "Estorno fundamentado do custo subsequente", idempotencyKey: "reverse-cost" };
      await assert.rejects(reverseAssetValuation(f.connection, context, { ...reversalInput, kind: "DEPRECIATION", recordId: history.id }), /posição posterior|posteriores/);
      const reversals = await Promise.all([reverseAssetValuation(f.connection, context, reversalInput), reverseAssetValuation(f.connection, context, reversalInput)]);
      assert.equal(reversals[0].id, reversals[1].id);
      assert.equal(await adjustmentCount(), 1);
      const restored = await readAsset();
      assert.equal(restored.currentValueDecimal!.toFixed(2), "66.67");
      assert.equal(restored.acquisitionValueDecimal!.toFixed(2), "100.00");
      await assert.rejects(reverseAssetValuation(f.connection, context, { ...reversalInput, reason: "Outro fundamento para estorno" }), /outros dados/);
      await reverseAssetValuation(f.connection, context, { ...reversalInput, kind: "DEPRECIATION", recordId: history.id, idempotencyKey: "reverse-depreciation" });
      assert.equal((await readAsset()).currentValueDecimal!.toFixed(2), "100.00");
      assert.equal(await historyCount(), 2);
      assert.equal((await f.db.select({ total: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ASSET_VALUATION_REVERSED"), eq(financialAuditLogs.financialYearId, "ano"))))[0].total, 2);
    } finally {
      if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
      else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
      await fixture?.close();
    }
  });
}
