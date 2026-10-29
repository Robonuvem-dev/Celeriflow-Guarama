import assert from "node:assert/strict";
import test from "node:test";
import { filterPublicDataset, transparencyQuerySchema, type PublicCollection, type PublicDataset } from "../src/lib/transparencia/query-contract";
import { renderTransparencyFile } from "../src/lib/transparencia/export-files";

const collection: PublicCollection = {
  slug: "audit-fixture", title: "Consulta de proteção", group: "Ensaio",
  description: "Fixture offline", columns: [{ key: "name", label: "Descrição" }, { key: "value", label: "Valor", kind: "money" }],
  filters: [], amountFields: ["value"],
};
function fixture(): PublicDataset {
  return {
    source: "EXEMPLO", status: "AVAILABLE", complete: true,
    updatedAt: "2026-10-29T00:00:00Z", provenance: "Dados sintéticos da auditoria",
    records: Array.from({ length: 41 }, (_, index) => ({
      key: `record-${index}`, entity: "prefeitura", year: 2026,
      values: { name: `Registro_${String(index).padStart(2, "0")}_integral`, value: `${index + 1}.01` },
    })),
  };
}

test("consulta encontra registro 41 antes de paginar e preserva escopo de entidade/exercício", () => {
  const dataset = fixture();
  dataset.records.push({ ...dataset.records[40], key: "other-entity", entity: "camara" }, { ...dataset.records[40], key: "other-year", year: 2025 });
  const result = filterPublicDataset(collection, dataset, transparencyQuerySchema.parse({ source: "EXEMPLO", year: 2026, search: "Registro_40_integral", page: 999, pageSize: 20 }));
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
  assert.deepEqual(result.records.map(record => record.key), ["record-40"]);
  assert.equal(dataset.records.length, 43, "A consulta não altera a origem usada pela exportação.");
});

test("ordenação monetária abrange o conjunto inteiro antes das páginas 20/20/1", () => {
  const dataset = fixture();
  const before = structuredClone(dataset);
  const query = transparencyQuerySchema.parse({ source: "EXEMPLO", year: 2026, sort: "value", direction: "desc", pageSize: 20 });
  const results = [1, 2, 3].map(page => filterPublicDataset(collection, dataset, { ...query, page }));
  assert.deepEqual(results.map(result => result.records.length), [20, 20, 1]);
  assert.deepEqual(results.flatMap(result => result.records.map(record => record.key)), Array.from({ length: 41 }, (_, index) => `record-${40 - index}`));
  assert.equal(results[0].totals.value, "861.41");
  assert.deepEqual(dataset, before);
});

test("CSV e TXT exportam todos os 41 registros independentemente da página de 20 visível", async () => {
  const dataset = fixture();
  const query = transparencyQuerySchema.parse({ source: "EXEMPLO", year: 2026, page: 2, pageSize: 20 });
  assert.equal(filterPublicDataset(collection, dataset, query).records.length, 20);
  for (const format of ["csv", "txt"] as const) {
    const pageTwo = await renderTransparencyFile(collection, dataset, query, format);
    const pageThree = await renderTransparencyFile(collection, dataset, { ...query, page: 3 }, format);
    assert.deepEqual(pageTwo.bytes, pageThree.bytes, `${format}: paginação de tela não recorta o arquivo.`);
    const text = Buffer.from(pageTwo.bytes).toString("utf8");
    assert.equal((text.match(/Registro_\d{2}_integral/g) ?? []).length, 41);
    assert.ok(text.includes("Registro_00_integral") && text.includes("Registro_40_integral"));
  }
});
