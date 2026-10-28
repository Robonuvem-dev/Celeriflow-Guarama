import assert from "node:assert/strict";
import { test } from "node:test";
import { AssetLifecycleError, calculateAssetDisposal, calculateAssetValueAdjustment, calculateStraightLineDepreciation, normalizeReferenceMonth, recordAssetDisposal } from "../asset-lifecycle";
import { assets, assetIntegrationPendingConfigurations, assetWriteOffs } from "@/db/schema/assets";
import { createAssetsFixture } from "./drizzle-fixture";

test("calculates straight-line depreciation and absorbs rounding in the final competence", () => {
  assert.equal(calculateStraightLineDepreciation({ acquisitionValue: 100, bookValue: 100, lifeSpanMonths: 3, periodNumber: 1 }), 33.33);
  assert.equal(calculateStraightLineDepreciation({ acquisitionValue: 100, bookValue: 33.34, lifeSpanMonths: 3, periodNumber: 3 }), 33.34);
});

test("never depreciates an asset before acquisition or after its useful life", () => {
  const input = { acquisitionValue: 120, bookValue: 120, lifeSpanMonths: 12 };
  assert.equal(calculateStraightLineDepreciation({ ...input, periodNumber: 0 }), 0);
  assert.equal(calculateStraightLineDepreciation({ ...input, periodNumber: 13 }), 0);
});

test("normalizes a competence to the first day of its UTC month", () => {
  assert.deepEqual(normalizeReferenceMonth(new Date("2026-08-27T00:00:00.000Z")), new Date("2026-08-01T12:00:00.000Z"));
  assert.throws(() => normalizeReferenceMonth(new Date("invalid")), AssetLifecycleError);
});

test("retains the book value and calculates the disposal gain or loss", () => {
  assert.deepEqual(calculateAssetDisposal(75.5, 100), { bookValue: 75.5, disposalValue: 100, gainLoss: 24.5 });
  assert.deepEqual(calculateAssetDisposal(75.5, 0), { bookValue: 75.5, disposalValue: 0, gainLoss: -75.5 });
});

test("calculates revaluation, impairment and subsequent cost without changing prior history", () => {
  assert.deepEqual(calculateAssetValueAdjustment(100, "REVALUATION", 125), { openingValue: 100, adjustmentValue: 25, closingValue: 125 });
  assert.deepEqual(calculateAssetValueAdjustment(100, "IMPAIRMENT", 75), { openingValue: 100, adjustmentValue: -25, closingValue: 75 });
  assert.deepEqual(calculateAssetValueAdjustment(100, "SUBSEQUENT_COST", 25), { openingValue: 100, adjustmentValue: 25, closingValue: 125 });
});

test("rejects unsafe asset value adjustments", () => {
  assert.throws(() => calculateAssetValueAdjustment(100, "IMPAIRMENT", 100), AssetLifecycleError);
  assert.throws(() => calculateAssetValueAdjustment(100, "SUBSEQUENT_COST", 0), AssetLifecycleError);
  assert.throws(() => calculateAssetValueAdjustment(100, "REVALUATION", 100), AssetLifecycleError);
});

test("records a configuration pending item instead of faking disposal accounting", async () => {
  const f = await createAssetsFixture();
  try {
    await f.connection.db.insert(assets).values({ id: "asset-1", patrimonyNumber: "PAT00001", name: "Equipamento", acquisitionDate: new Date("2026-01-01T12:00:00Z"), acquisitionValue: 100, currentValue: 75, categoryId: "asset-category" });
    const input = { assetId: "asset-1", date: new Date("2026-08-01T12:00:00.000Z"), type: "Alienação" as const, reason: "Leilão", justification: "Processo 1", disposalValue: 100 };
    const result = await recordAssetDisposal(f.connection, input);
    assert.equal(result.integration.pending, true);
    assert.equal((await f.connection.db.select().from(assets))[0].status, "Baixado");
    const [pending] = await f.connection.db.select().from(assetIntegrationPendingConfigurations);
    assert.equal(pending.assetWriteOffId, result.id);
    assert.equal(pending.expectedEventCode, "ASSET_DISPOSAL_GAIN");
    assert.equal(pending.reason, "A baixa não possui servidor responsável apto a postar o evento contábil.");
    assert.equal(result.gainLoss, 25);
    await assert.rejects(recordAssetDisposal(f.connection, input), /baixado ou inativo/);
    assert.equal((await f.connection.db.select().from(assetWriteOffs)).length, 1);
  } finally { await f.close(); }
});

test("Drizzle disposal rolls back its history and pending integration when asset update fails", async () => {
  const f = await createAssetsFixture();
  try {
    await f.connection.db.insert(assets).values({ id: "asset-1", patrimonyNumber: "PAT00001", name: "Equipamento", acquisitionDate: new Date("2026-01-01T12:00:00Z"), acquisitionValue: 100, currentValue: 75, categoryId: "asset-category" });
    await f.pg.exec(`CREATE FUNCTION fail_asset_disposal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'asset unavailable'; END $$;
      CREATE TRIGGER fail_asset_disposal BEFORE UPDATE ON "Asset" FOR EACH ROW EXECUTE FUNCTION fail_asset_disposal();`);
    await assert.rejects(recordAssetDisposal(f.connection, { assetId: "asset-1", date: new Date("2026-08-01T12:00:00Z"), type: "Baixa", reason: "Perda", justification: "Processo 2" }));
    assert.equal((await f.connection.db.select().from(assets))[0].status, "Ativo");
    assert.equal((await f.connection.db.select().from(assetWriteOffs)).length, 0);
    assert.equal((await f.connection.db.select().from(assetIntegrationPendingConfigurations)).length, 0);
  } finally { await f.close(); }
});
