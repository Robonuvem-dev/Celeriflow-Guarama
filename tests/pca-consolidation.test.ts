import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidatePca, summarizePcaBudget } from "../src/lib/compras/pca-consolidation";

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

test("PCA identifies absent, partial and complete request allocations across appropriations", () => {
  const item = { itemId: "item", quantity: 2, estimatedUnitValue: 50 };
  const first = { ...item, allocationId: "a", appropriationId: "one", code: "01", allocatedQuantity: 1, allocatedValue: "50.00" };
  const second = { ...first, allocationId: "b", appropriationId: "two", code: "02" };
  const absent = { ...item, allocationId: null, appropriationId: null, code: null, allocatedQuantity: null, allocatedValue: null };
  assert.equal(summarizePcaBudget([absent]).status, "Ausente");
  assert.equal(summarizePcaBudget([first]).status, "Parcial ou divergente");
  assert.equal(summarizePcaBudget([first, second, { ...absent, itemId: "other" }]).status, "Parcial ou divergente");
  const result = summarizePcaBudget([first, first, second]);
  assert.equal(result.status, "Completa");
  assert.deepEqual(result.appropriations.map(row => [row.code, row.amount.toFixed(2)]), [["01", "50.00"], ["02", "50.00"]]);
});
