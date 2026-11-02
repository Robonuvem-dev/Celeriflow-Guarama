import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { OperationalContext } from "../src/components/app-ui/operational/OperationalContext";
import { findOperationalRoute } from "../src/components/app-ui/operational/routes";
import { operationalModules } from "../src/components/app-ui/operational/modules/saneamento-ambiente";
import { recyclingUiProps as props } from "./fixtures/recycling-stock-ui";

// Node não processa CSS Modules; geometria e CSS reais são verificados no teste browser.
const require = createRequire(import.meta.url);
require.extensions[".css"] = module => { module.exports = {}; };
const { StockView } = require("../src/app/app-domain/meio-ambiente/residuos/estoque/StockView") as typeof import("../src/app/app-domain/meio-ambiente/residuos/estoque/StockView");
const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "test" };
function render(overrides: Partial<typeof props> = {}) {
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(OperationalContext.Provider, { value: { userId: "fixture", device: "desktop", actionsHost: null } }, createElement(StockView, { ...props, ...overrides }))));
}
test("rota de estoque resolve o workspace ambiental com navegação própria nas duas visões", () => {
  for (const visao of ["saldos", "historico"]) {
    const resolved = findOperationalRoute(operationalModules, "/meio-ambiente/residuos/estoque", new URLSearchParams({ visao }));
    assert.equal(resolved?.module.key, "meio-ambiente");
    assert.equal(resolved?.route.title, "Estoque de Recicláveis");
    const items = resolved!.module.navigation.flatMap(group => group.items);
    assert(items.some(item => item.href === "/meio-ambiente/residuos/estoque"));
    assert(items.find(item => item.href === "/meio-ambiente/residuos")?.exact);
  }
});
test("consulta usa tabela e paginação operacionais sem oferecer movimentação", () => {
  const html = render();
  assert.match(html, /data-operational-table/);
  assert.match(html, /data-operational-pagination/);
  assert.match(html, /Depósito central/);
  assert.match(html, /6,100/);
  assert.match(html, /8,100/);
  assert.match(html, /estoquePagina=2/);
  assert.match(html, /visao=historico/);
  assert.doesNotMatch(html, /Registrar entrada|Registrar saída/);
});
test("operação permite saída somente quando há saldo disponível", () => {
  assert.match(render({ canRecord: true }), /Registrar saída/);
  const noStock = render({ canRecord: true, positions: [{ ...props.positions[0], quantity: "0.000", canDispatch: false }] });
  assert.doesNotMatch(noStock, /Registrar saída/);
  assert.match(noStock, /Sem saldo disponível/);
});
test("histórico mantém precisão, detalhes e paginação independente dos saldos", () => {
  const html = render({ view: "history", stockPage: 2 });
  assert.match(html, /R\$ 9999999999999,90/);
  assert.match(html, /Detalhes da movimentação de Papel/);
  assert.match(html, /historicoPagina=2/);
  assert.match(html, /estoquePagina=2/);
  assert.doesNotMatch(html, /<script>/);
});
