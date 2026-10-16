import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { depreciateAssetsForMonth, recordAssetValueAdjustment } from "../src/lib/patrimonio/asset-lifecycle";
import { reverseAssetValuation } from "../src/lib/patrimonio/valuation-reversal";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P4: depreciação atômica, Decimal, concorrência e ajustes rastreáveis (${jurisdiction})`, async () => {
    const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      await f.db.department.create({ data: { id: "asset-department", name: "Patrimônio municipal", secretariatId: "secretaria", isActive: true } });
      for (const id of ["category-a", "category-b"]) await f.db.assetCategory.create({ data: { id, code: id, name: id, lifeSpan: 3, isActive: true } });
      for (const [id, categoryId] of [["asset-a", "category-a"], ["asset-b", "category-b"]]) await f.db.asset.create({ data: {
        id, patrimonyNumber: id, name: id, categoryId, departmentId: "asset-department", budgetUnitId: "ug", acquisitionDate: new Date("2026-09-10T12:00:00Z"), acquisitionValue: 100, currentValue: 100, acquisitionValueDecimal: "100.00", currentValueDecimal: "100.00",
      } });
      const rule = async (code: string) => f.db.accountingEventCatalog.create({ data: { code, name: code, rules: { create: { debitAccountId: "debito", creditAccountId: "credito", isReference: true } } } });
      await rule("ASSET_DEPRECIATION:category-a");
      const context = { actor: f.actor, budgetUnitId: "ug" };
      const month = new Date("2026-09-01T12:00:00Z");
      await assert.rejects(depreciateAssetsForMonth(f.db, month, context));
      assert.equal(await f.db.assetValueHistory.count(), 0);
      assert.equal(await f.db.accountingTransaction.count({ where: { sourceModule: "PATRIMONIO" } }), 0);
      assert.equal((await f.db.asset.findUniqueOrThrow({ where: { id: "asset-a" } })).currentValueDecimal!.toFixed(2), "100.00");
      await rule("ASSET_DEPRECIATION:category-b");
      const results = await Promise.all([depreciateAssetsForMonth(f.db, month, context), depreciateAssetsForMonth(f.db, month, context)]);
      assert.equal(results.reduce((sum, result) => sum + result.processed, 0), 2);
      assert.equal(await f.db.assetValueHistory.count(), 2);
      const history = await f.db.assetValueHistory.findFirstOrThrow({ where: { assetId: "asset-a" }, include: { accountingTransaction: true } });
      assert.equal(history.depreciationDecimal!.toFixed(2), "33.33");
      assert.equal(history.closingValueDecimal!.toFixed(2), "66.67");
      assert.equal(history.accountingTransaction!.budgetUnitId, "ug");
      assert.equal(history.accountingTransaction!.date.toISOString(), "2026-09-30T12:00:00.000Z");
      await assert.rejects(depreciateAssetsForMonth(f.db, month, { ...context, actor: { ...f.actor, allowedBudgetUnitIds: [] } }), /autorizadas/);
      const input = { assetId: "asset-a", date: new Date("2026-10-01T12:00:00Z"), type: "SUBSEQUENT_COST" as const, value: 0.01, justification: "Custo subsequente fundamentado", evidence: "Documento municipal preservado", idempotencyKey: "cost-a" };
      await assert.rejects(recordAssetValueAdjustment(f.db, input, context));
      assert.equal(await f.db.assetValueAdjustment.count(), 0);
      assert.equal((await f.db.asset.findUniqueOrThrow({ where: { id: "asset-a" } })).currentValueDecimal!.toFixed(2), "66.67");
      await rule("ASSET_SUBSEQUENT_COST:category-a");
      const adjustments = await Promise.all([recordAssetValueAdjustment(f.db, input, context), recordAssetValueAdjustment(f.db, input, context)]);
      assert.equal(adjustments[0].id, adjustments[1].id);
      assert.ok(adjustments[0].accountingTransactionId);
      assert.equal(await f.db.assetValueAdjustment.count(), 1);
      const asset = await f.db.asset.findUniqueOrThrow({ where: { id: "asset-a" } });
      assert.equal(asset.currentValueDecimal!.toFixed(2), "66.68");
      assert.equal(asset.acquisitionValueDecimal!.toFixed(2), "100.01");
      await assert.rejects(recordAssetValueAdjustment(f.db, { ...input, value: 0.02 }, context), /outros dados/);
      await assert.rejects(recordAssetValueAdjustment(f.db, { ...input, date: new Date("2026-09-20"), idempotencyKey: "backdated" }, context), /última competência/);
      const reversalInput = { kind: "ADJUSTMENT" as const, recordId: adjustments[0].id, date: new Date("2026-10-02T12:00:00Z"), reason: "Estorno fundamentado do custo subsequente", idempotencyKey: "reverse-cost" };
      await assert.rejects(reverseAssetValuation(f.db, context, { ...reversalInput, kind: "DEPRECIATION", recordId: history.id }), /posição posterior|posteriores/);
      const reversals = await Promise.all([reverseAssetValuation(f.db, context, reversalInput), reverseAssetValuation(f.db, context, reversalInput)]);
      assert.equal(reversals[0].id, reversals[1].id);
      assert.equal(await f.db.assetValueAdjustment.count(), 1);
      const restored = await f.db.asset.findUniqueOrThrow({ where: { id: "asset-a" } });
      assert.equal(restored.currentValueDecimal!.toFixed(2), "66.67");
      assert.equal(restored.acquisitionValueDecimal!.toFixed(2), "100.00");
      await assert.rejects(reverseAssetValuation(f.db, context, { ...reversalInput, reason: "Outro fundamento para estorno" }), /outros dados/);
      await reverseAssetValuation(f.db, context, { ...reversalInput, kind: "DEPRECIATION", recordId: history.id, idempotencyKey: "reverse-depreciation" });
      assert.equal((await f.db.asset.findUniqueOrThrow({ where: { id: "asset-a" } })).currentValueDecimal!.toFixed(2), "100.00");
      assert.equal(await f.db.assetValueHistory.count(), 2);
      assert.equal(await f.db.financialAuditLog.count({ where: { action: "ASSET_VALUATION_REVERSED" } }), 2);
    } finally {
      if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
      else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
      await f.close();
    }
  });
}
