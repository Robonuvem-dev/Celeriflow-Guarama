import assert from "node:assert/strict";
import test from "node:test";
import { catalogEntrySchema, minimumWageSchema } from "../src/lib/social/catalog-policy";

test("catálogos SUAS rejeitam categoria desconhecida e nome vazio", () => {
  assert.equal(catalogEntrySchema.safeParse({ kind: "UNKNOWN", name: "Teste", isActive: true }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ kind: "INCOME", name: "  ", isActive: true }).success, false);
  assert.equal(catalogEntrySchema.parse({ kind: "INCOME", name: "  Trabalho formal  ", isActive: false }).name, "Trabalho formal");
});

test("vigência salarial rejeita data inexistente e aceita ano bissexto", () => {
  assert.equal(minimumWageSchema.safeParse({ validFrom: "2026-02-30", value: "1500.00" }).success, false);
  assert.equal(minimumWageSchema.safeParse({ validFrom: "2024-02-29", value: "1500.00" }).success, true);
});

test("salário mínimo exige valor positivo com precisão monetária", () => {
  for (const value of ["0", "-1", "1.001", "NaN", "Infinity", "1e3", "1,50"]) {
    assert.equal(minimumWageSchema.safeParse({ validFrom: "2026-01-01", value }).success, false, value);
  }
  assert.equal(minimumWageSchema.parse({ validFrom: "2026-01-01", value: "1621.00" }).value, "1621.00");
});
