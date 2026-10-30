import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecyclingEntries, recyclingEntryKey, recyclingEntrySchema } from "../src/lib/environment/recycling-catalog";

test("reciclagem separa códigos por catálogo e normaliza identidade", () => {
  assert.equal(recyclingEntryKey({ kind: "units", code: "kg" }), "RECYCLING_CATALOG:units:KG");
  assert.notEqual(recyclingEntryKey({ kind: "units", code: "kg" }), recyclingEntryKey({ kind: "materials", code: "kg" }));
});
test("catálogos rejeitam dados inválidos e ignoram parâmetros de outros módulos", () => {
  const entry = { kind: "depots", code: "D1", name: "Depósito central", description: "Seco", address: "Rua A", active: true };
  assert.equal(recyclingEntrySchema.safeParse({ ...entry, kind: "unknown" }).success, false);
  assert.equal(recyclingEntrySchema.safeParse({ ...entry, code: "../x" }).success, false);
  assert.equal(recyclingEntrySchema.safeParse({ ...entry, name: " " }).success, false);
  assert.deepEqual(parseRecyclingEntries([null, 5, { unrelated: true }, entry]), [entry]);
});
test("todos os cinco catálogos preservam a situação de inatividade", () => {
  for (const kind of ["units", "types", "materials", "depots", "centers"]) {
    const parsed = recyclingEntrySchema.parse({ kind, code: "01", name: "Cadastro", description: "", address: "", active: false });
    assert.equal(parsed.active, false);
  }
});
