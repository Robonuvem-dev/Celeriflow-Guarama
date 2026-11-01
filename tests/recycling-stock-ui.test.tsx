import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { StockView } from "../src/app/app-domain/meio-ambiente/residuos/estoque/StockView";

const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "test" };
const props: Parameters<typeof StockView>[0] = {
  entries: [
    { kind: "centers", code: "DEST", name: "Centro ativo", address: "Local", description: "", active: true },
    { kind: "centers", code: "OLD", name: "Centro inativo", address: "Local antigo", description: "", active: false },
  ],
  positions: [{ materialCode: "M1", materialName: "Papel", typeName: "Recicláveis", unitCode: "KG", unitName: "kg", depotCode: "D1", depotName: "Depósito central", quantity: "6.100", materialTotal: "8.100", canDispatch: true, requestKey: "376f6ac0-ab52-4b5d-b19c-87e6bd32aed7" }],
  history: [{ id: "movement", kind: "EXIT", quantity: "4.025", amount: "9999999999999.90", quantityAfter: "6.100", occurredOn: "2026-11-01", origin: "", notes: "<script>não executar</script>", snapshot: { material: { code: "M1", name: "Papel" }, depot: { code: "D1", name: "Depósito central" }, materialType: { code: "REC", name: "Recicláveis" }, unit: { code: "KG", name: "kg" }, destination: { code: "DEST", name: "Centro ativo", address: "Local" } } }],
  stockPage: 1, historyPage: 1, stockTotal: 21, historyTotal: 21, pageSize: 20,
  canRecord: false, today: "2026-11-01", entryRequestKey: "3c0a6034-15ac-4668-b2f9-ad29c1cf582a",
  recordAction: async () => ({ success: true }),
};
function render(overrides: Partial<typeof props> = {}) {
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(StockView, { ...props, ...overrides })));
}
test("consulta exibe saldo/histórico e paginação sem oferecer formulários de movimentação", () => {
  const html = render();
  assert.match(html, /Depósito central/);
  assert.match(html, /6,100/);
  assert.match(html, /8,100/);
  assert.match(html, /estoquePagina=2/);
  assert.match(html, /historicoPagina=2/);
  assert.doesNotMatch(html, /Registrar entrada|Registrar saída/);
});
test("operação permite entrada e saída com centro ativo, e não oferece saída sem saldo", () => {
  const html = render({ canRecord: true });
  assert.match(html, /Registrar entrada/);
  assert.match(html, /Registrar saída/);
  assert.match(html, /<option value="DEST"/);
  assert.doesNotMatch(html, /<option value="OLD"/);
  const noStock = render({ canRecord: true, positions: [{ ...props.positions[0], quantity: "0.000", canDispatch: false }] });
  assert.doesNotMatch(noStock, /Registrar saída/);
  assert.match(noStock, /Sem saldo disponível/);
});
test("histórico mostra destino/receita precisos e escapa as observações livres", () => {
  const html = render();
  assert.match(html, /R\$ 9999999999999,90/);
  assert.match(html, /Centro ativo/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
