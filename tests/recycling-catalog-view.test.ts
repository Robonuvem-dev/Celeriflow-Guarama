import assert from "node:assert/strict";
import { test } from "node:test";
import { selectRecyclingCatalogPage } from "../src/app/app-domain/meio-ambiente/residuos/cadastros/catalog-list";
import { parseRecyclingEntries, recyclingCatalogs, type RecyclingEntry } from "../src/lib/environment/recycling-catalog";
import { findOperationalRoute } from "../src/components/app-ui/operational/routes";
import { operationalModules } from "../src/components/app-ui/operational/modules/saneamento-ambiente";

const entries: RecyclingEntry[] = Object.keys(recyclingCatalogs).flatMap(kind => Array.from({ length: 21 }, (_, index) => ({ kind: kind as RecyclingEntry["kind"], code: `C${String(index + 1).padStart(2, "0")}`, name: `Cadastro ${String(index + 1).padStart(2, "0")}`, description: index === 20 ? "Texto integral pesquisável" : "Descrição", address: index === 20 ? "Rua dos ipês" : "", active: index !== 20 })));
test("cadastros recebem o workspace ambiental para qualquer catálogo ou situação", () => {
  for (const catalog of Object.keys(recyclingCatalogs)) {
    const resolved = findOperationalRoute(operationalModules, "/meio-ambiente/residuos/cadastros", new URLSearchParams({ catalog, situacao: "Inativo" }));
    assert.equal(resolved?.module.key, "meio-ambiente");
    assert.equal(resolved?.route.title, "Cadastros de Reciclagem");
  }
});
test("cada catálogo pagina 20/1 sem duplicar nem misturar registros", () => {
  for (const catalog of Object.keys(recyclingCatalogs)) {
    const first = selectRecyclingCatalogPage(entries, { catalog });
    const last = selectRecyclingCatalogPage(entries, { catalog, page: "2" });
    assert.equal(first.items.length, 20); assert.equal(last.items.length, 1);
    assert.equal(first.total, 21); assert(first.items.every(entry => entry.kind === catalog));
    assert.equal(new Set([...first.items, ...last.items].map(entry => entry.code)).size, 21);
    assert.equal(selectRecyclingCatalogPage(entries, { catalog, page: "999" }).currentPage, 2);
    assert.equal(selectRecyclingCatalogPage(entries, { catalog, page: "-1" }).currentPage, 1);
  }
});
test("busca e situação são aplicadas antes da paginação em todos os campos existentes", () => {
  for (const q of ["c21", "CADASTRO 21", "pesquisável", "IPÊS"]) {
    const list = selectRecyclingCatalogPage(entries, { catalog: "depots", q, situacao: "Inativo", page: "2" });
    assert.equal(list.total, 1); assert.equal(list.currentPage, 1); assert.equal(list.items[0].code, "C21");
  }
  assert.equal(selectRecyclingCatalogPage(entries, { catalog: "depots", situacao: "Ativo" }).total, 20);
  assert.equal(selectRecyclingCatalogPage(entries, { catalog: "depots", q: "true" }).total, 0);
});
test("consulta vazia, parâmetro desconhecido e catálogo malicioso mantêm limites seguros", () => {
  const empty = selectRecyclingCatalogPage(entries, { catalog: "units", q: "inexistente", page: "999" });
  assert.equal(empty.total, 0); assert.equal(empty.currentPage, 1); assert.deepEqual(empty.items, []);
  for (const catalog of ["__proto__", "constructor", "nao-existe"]) assert.equal(selectRecyclingCatalogPage(entries, { catalog }).kind, "units");
  assert.equal(selectRecyclingCatalogPage(entries, { catalog: "units", situacao: "desconhecida", page: "NaN" }).total, 21);
});
test("seleção preserva ordenação e campos completos dos parâmetros legados", () => {
  const list = selectRecyclingCatalogPage(parseRecyclingEntries(entries.slice().reverse()), { catalog: "centers", q: "C21" });
  assert.equal(list.items[0].description, "Texto integral pesquisável");
  assert.equal(list.items[0].address, "Rua dos ipês");
  assert.equal(list.items[0].active, false);
  assert.equal(entries.length, 105);
});
