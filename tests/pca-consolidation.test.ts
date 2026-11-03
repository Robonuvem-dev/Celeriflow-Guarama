import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidatePca } from "../src/lib/compras/pca-consolidation";

test("PCA filters by year and unit, deduplicates and sums exact amounts", () => {
  const demand = { id: "a", year: 2026, unitId: "u", unitName: "Compras", description: "Papel", estimatedValue: "0.10" };
  const demands = [
    demand, demand,
    { ...demand, id: "b", estimatedValue: "0.20" },
    { ...demand, id: "c", year: 2027 },
    { ...demand, id: "d", unitId: null, unitName: null },
  ];
  const [group] = consolidatePca(demands, 2026, "u");
  assert.equal(group.total.toFixed(2), "0.30");
  assert.deepEqual(group.demands.map(item => item.id), ["a", "b"]);
  assert.deepEqual(consolidatePca(demands, 2026, "").map(item => item.name), ["Sem unidade identificada"]);
  assert.equal(consolidatePca(demands, 2027).length, 1);
  assert.deepEqual(consolidatePca(demands, 2028), []);
});
