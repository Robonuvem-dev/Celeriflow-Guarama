import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise component event handlers with an isolated hook store and action spies.
// No Next runtime, shared workspace, network, or database is needed for these state/payload checks.
function harness(file, name, props) {
  const slots = [], tasks = [], calls = [];
  let cursor = 0, sequence = 0;
  const state = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const actions = new Proxy({}, { get: (_, action) => async (...args) => { calls.push({ action, args }); return { message: "Registrado", requestId: "created" }; } });
  const requireMock = specifier => {
    if (specifier === "react") return { useState: state, useRef: initial => state(() => ({ current: initial }))[0], useTransition: () => [false, callback => tasks.push(Promise.resolve(callback()))] };
    if (specifier === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };
    if (specifier === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    if (specifier.endsWith("/actions") || specifier.endsWith("/rules-actions")) return actions;
    if (specifier === "@/lib/operational-tables") return { OPERATIONAL_PAGE_SIZE: 20 };
    if (specifier.endsWith("/operational-columns")) return { operationalColumns: definitions => definitions };
    if (specifier.endsWith(".css")) return { __esModule: true, default: {} };
    return new Proxy({}, { get: (_, component) => component });
  };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const sandboxModule = { exports: {} };
  runInNewContext(output, { module: sandboxModule, exports: sandboxModule.exports, require: requireMock, crypto: { randomUUID: () => `delivery-${++sequence}` } });
  return { render: () => { cursor = 0; return sandboxModule.exports[name](props); }, calls, flush: async () => { await Promise.all(tasks.splice(0)); } };
}
function nodes(value) {
  if (!value || typeof value !== "object") return [];
  const own = value.type ? [value] : [];
  return own.concat(Object.values(value).flatMap(nodes));
}
function find(tree, predicate) {
  const node = nodes(tree).find(predicate);
  assert.ok(node, "Expected control was not found");
  return node;
}
const table = tree => find(tree, node => node.type === "OperationalTable");
const pagination = tree => find(tree, node => node.type === "OperationalPagination");
const change = (node, value) => node.props.onChange({ target: { value } });
const inventoryItems = () => Array.from({ length: 21 }, (_, index) => ({ id: `item-${index}`, expectedQuantity: 10, countedQuantity: null, divergenceType: "SEM_DIVERGENCIA", countEvidence: null, adjustmentReason: null, stock: { batchNumber: `batch-${index}`, material: { code: `code-${index}`, name: `Material ${index}`, unitOfMeasure: "UN" } } }));
const requestItems = () => inventoryItems().map(item => ({ id: item.id, quantityRequested: 10, quantityApproved: 10, quantityDelivered: 0, material: { ...item.stock.material, id: item.id } }));

test("inventory: 21 items, off-page drafts survive paging/search and save the complete item payload", async () => {
  const h = harness("../inventarios/InventoryCountClient.tsx", "InventoryCountClient", { sessionId: "session", status: "COUNTING", items: inventoryItems() });
  let tree = h.render();
  assert.equal(table(tree).props.rows.length, 20);
  change(find(tree, n => n.type === "input" && n.props.name === "countedQuantity"), "12.5");
  tree = h.render();
  change(find(tree, n => n.type === "textarea" && n.props.name === "countEvidence"), "Foto da contagem");
  tree = h.render();
  change(find(tree, n => n.type === "textarea" && n.props.name === "adjustmentReason"), "Conferência física");
  pagination(h.render()).props.onPageChange(2);
  tree = h.render();
  assert.equal(table(tree).props.rows.length, 1);
  assert.equal(table(tree).props.rows[0].id, "item-20");
  change(find(tree, n => n.type === "input" && n.props.type === "search"), "Material 20");
  tree = h.render();
  assert.equal(pagination(tree).props.total, 1);
  assert.equal(find(tree, n => n.type === "input" && n.props.name === "countedQuantity").props.value, "12.5");
  find(tree, n => n.type === "form").props.onSubmit({ preventDefault() {} });
  await h.flush();
  const payload = h.calls.find(call => call.action === "recordInventoryCountAction").args[0];
  assert.equal(payload.itemId, "item-0");
  assert.equal(payload.countedQuantity, 12.5);
  assert.equal(payload.countEvidence, "Foto da contagem");
  assert.equal(payload.adjustmentReason, "Conferência física");
});

test("request approval includes every item and retains approval changes outside the visible page", async () => {
  const h = harness("../requisicoes/[id]/MaterialRequestWorkflowClient.tsx", "MaterialRequestWorkflowClient", { request: { id: "request", number: "REQ", status: "Pendente", items: requestItems() }, stocks: [], canApprove: true, canIssue: false });
  let tree = h.render();
  assert.equal(table(tree).props.rows.length, 20);
  change(table(tree).props.rows[0].cells.approved, "4");
  pagination(h.render()).props.onPageChange(2);
  tree = h.render();
  assert.equal(table(tree).props.rows.length, 1);
  change(table(tree).props.rows[0].cells.approved, "7");
  tree = h.render();
  find(tree, n => n.type === "Button" && n.props.children === "Confirmar análise e aprovação").props.onClick();
  await h.flush();
  const quantities = h.calls.find(call => call.action === "approveMaterialRequestAction").args[1];
  assert.equal(quantities.length, 21);
  assert.equal(quantities[0].quantityApproved, 4);
  assert.equal(quantities[20].quantityApproved, 7);
});

test("full delivery preserves off-page stock/settlement choices and sends all remaining items", async () => {
  const items = requestItems();
  const stocks = items.map(item => ({ id: `stock-${item.id}`, materialId: item.id, quantity: 20, batchNumber: "L", expirationLabel: "31/12/2027", warehouse: { name: "Origem" } }));
  const h = harness("../requisicoes/[id]/MaterialRequestWorkflowClient.tsx", "MaterialRequestWorkflowClient", { request: { id: "request", number: "REQ", status: "Aprovada", items }, stocks, settlements: [{ id: "settlement", label: "Liquidação" }], canApprove: false, canIssue: true });
  let tree = h.render();
  change(find(tree, n => n.type === "select" && n.props.value === "item-0"), "item-20");
  tree = h.render();
  change(find(tree, n => n.type === "select" && n.props["aria-label"] === "Liquidação de Material 20"), "settlement");
  pagination(h.render()).props.onPageChange(2);
  tree = h.render();
  assert.equal(table(tree).props.rows.length, 1);
  find(tree, n => n.type === "Button" && n.props.children === "Entregar todo o saldo pendente").props.onClick();
  await h.flush();
  const payload = h.calls.find(call => call.action === "issueMaterialRequestInFullAction").args[0];
  assert.equal(payload.stockByItem.length, 21);
  assert.equal(payload.stockByItem[20].stockId, "stock-item-20");
  assert.equal(payload.stockByItem[20].settlementId, "settlement");
});

test("successful partial deliveries get distinct idempotency keys without remounting other drafts", async () => {
  const items = requestItems();
  const stocks = items.map(item => ({ id: `stock-${item.id}`, materialId: item.id, quantity: 20, batchNumber: "L", expirationLabel: "—", warehouse: { name: "Origem" } }));
  const h = harness("../requisicoes/[id]/MaterialRequestWorkflowClient.tsx", "MaterialRequestWorkflowClient", { request: { id: "request", number: "REQ", status: "Aprovada", items }, stocks, canApprove: false, canIssue: true });
  change(find(h.render(), n => n.type === "Input" && n.props["aria-label"] === "Quantidade a entregar de Material 0"), "2");
  find(h.render(), n => n.type === "Button" && n.props.children === "Registrar entrega").props.onClick();
  await h.flush();
  find(h.render(), n => n.type === "Button" && n.props.children === "Registrar entrega").props.onClick();
  await h.flush();
  const deliveries = h.calls.filter(call => call.action === "issueMaterialRequestItemAction");
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].args[0].quantity, 2);
  assert.notEqual(deliveries[0].args[0].idempotencyKey, deliveries[1].args[0].idempotencyKey);
});

const draftDefinition = () => ({
  fields: Array.from({ length: 21 }, (_, index) => ({ key: `field_${index}`, label: `Campo ${index}`, type: index === 0 ? "CHOICE" : "TEXT", required: false, options: index === 0 ? ["Original"] : [] })),
  checks: Array.from({ length: 21 }, (_, index) => ({ key: `check_${index}`, label: `Critério ${index}`, required: true })),
  documents: Array.from({ length: 21 }, (_, index) => ({ label: `Documento ${index}`, required: true })),
});
const rulesProps = definition => ({ tab: "definitions", kind: "FORM", page: 1, total: 0, canManage: true, rows: [], definition, purposes: [], properties: [], zoneOptions: [], departments: [], employees: [] });
const namedTable = (tree, preferenceId) => find(tree, n => n.type === "OperationalTable" && n.props.preferenceId === preferenceId);
const namedPagination = (tree, label) => find(tree, n => n.type === "OperationalListFrame" && n.props.label === label).props.pagination;

test("definition editors page 20+1 and publish all fields, checks, documents and choice options", async () => {
  const h = harness("../../obras/construcao-civil/regras/ConstructionRulesClient.tsx", "default", rulesProps(draftDefinition()));
  const fieldId = "obras-regras-campos-edicao", checkId = "obras-regras-criterios-edicao", documentId = "obras-regras-documentos-edicao";
  let tree = h.render();
  for (const id of [fieldId, checkId, documentId]) {
    assert.equal(namedTable(tree, id).props.rows.length, 20);
    assert.ok(namedTable(tree, id).props.columns.reduce((sum, column) => sum + column[3], 0) <= 1224);
  }
  change(namedTable(tree, fieldId).props.rows[0].cells.key, "first_edited");
  tree = h.render();
  namedTable(tree, fieldId).props.rows[0].cells.options.props.onClick();
  tree = h.render();
  change(find(tree, n => n.type === "textarea" && n.props["aria-label"] === "Opções do campo"), "Escolha A\nEscolha B");
  namedPagination(h.render(), "Campos adicionais").props.onPageChange(2);
  tree = h.render();
  assert.equal(namedTable(tree, fieldId).props.rows.length, 1);
  change(namedTable(tree, fieldId).props.rows[0].cells.label, "Último campo editado");
  namedPagination(h.render(), "Critérios para deferimento").props.onPageChange(2);
  tree = h.render();
  assert.equal(namedTable(tree, checkId).props.rows.length, 1);
  change(namedTable(tree, checkId).props.rows[0].cells.label, "Último critério editado");
  namedPagination(h.render(), "Documentos da etapa").props.onPageChange(2);
  tree = h.render();
  assert.equal(namedTable(tree, documentId).props.rows.length, 1);
  change(namedTable(tree, documentId).props.rows[0].cells.label, "Último documento editado");
  await find(h.render(), n => n.type === "form" && n.props.id === "construction-definition").props.onSubmit({ preventDefault() {} });
  const payload = h.calls.find(call => call.action === "publishConstructionDefinition").args[0];
  assert.equal(payload.definition.fields.length, 21);
  assert.equal(payload.definition.fields[0].key, "first_edited");
  assert.equal(Array.from(payload.definition.fields[0].options).join("|"), "Escolha A|Escolha B");
  assert.equal(payload.definition.fields[20].label, "Último campo editado");
  assert.equal(payload.definition.checks.length, 21);
  assert.equal(payload.definition.checks[20].label, "Último critério editado");
  assert.equal(payload.definition.documents.length, 21);
  assert.equal(payload.definition.documents[20].label, "Último documento editado");
  assert.equal("id" in payload.definition.fields[0], false, "UI identities must not leak into the action DTO");
});

test("definition: invalid off-page input blocks publishing; removing a row preserves other drafts and identity", async () => {
  const definition = draftDefinition();
  definition.fields[20].key = "";
  const h = harness("../../obras/construcao-civil/regras/ConstructionRulesClient.tsx", "default", rulesProps(definition));
  await find(h.render(), n => n.type === "form" && n.props.id === "construction-definition").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
  let tree = h.render();
  assert.equal(namedPagination(tree, "Campos adicionais").props.page, 2);
  const lastId = namedTable(tree, "obras-regras-campos-edicao").props.rows[0].id;
  change(namedTable(tree, "obras-regras-campos-edicao").props.rows[0].cells.key, "fixed_last");
  namedPagination(h.render(), "Campos adicionais").props.onPageChange(1);
  namedTable(h.render(), "obras-regras-campos-edicao").props.rows[0].actions.props.onClick();
  tree = h.render();
  const rows = namedTable(tree, "obras-regras-campos-edicao").props.rows;
  assert.equal(rows.length, 20);
  assert.equal(rows[19].id, lastId);
  assert.equal(rows[19].values.key, "fixed_last");
  await find(tree, n => n.type === "form" && n.props.id === "construction-definition").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls[0].args[0].definition.fields.length, 20);
});

test("definition editors preserve read-only permissions for portal controls", async () => {
  const h = harness("../../obras/construcao-civil/regras/ConstructionRulesClient.tsx", "default", { ...rulesProps(draftDefinition()), canManage: false });
  const tree = h.render();
  const fields = namedTable(tree, "obras-regras-campos-edicao").props.rows;
  assert.equal(fields[0].cells.key.props.disabled, true);
  assert.equal(fields[0].cells.required.props.disabled, true);
  assert.equal(fields[0].actions.props.disabled, true);
  await find(tree, n => n.type === "form" && n.props.id === "construction-definition").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
});

test("new requisition: 21 draft items retain selections, reject hidden invalid quantity and submit the whole payload", async () => {
  const h = harness("../requisicoes/nova/MaterialRequestForm.tsx", "MaterialRequestForm", { warehouses: [{ id: "warehouse", name: "Origem" }], departments: [{ id: "department", name: "Destino" }], categories: [], initialRequester: { id: "requester", label: "Recebedor", departmentId: "department" }, canSelectRequester: false });
  let tree = h.render();
  change(find(tree, n => n.type === "select" && n.props.children?.[0]?.props.children === "Selecione a origem do estoque"), "warehouse");
  for (let index = 0; index < 21; index++) {
    tree = h.render();
    if (index) find(tree, n => n.type === "button" && n.props.children === "Adicionar item").props.onClick();
    else table(tree).props.rows[0].actions.props.children[0].props.onClick();
    tree = h.render();
    find(tree, n => n.type === "SearchReferenceField" && n.props.kind === "materials").props.onSelect({ id: `material-${index}`, label: `Material ${index}`, unitOfMeasure: "UN", quantity: 100 });
    tree = h.render();
    change(table(tree).props.rows.at(-1).cells.quantity, String(index + 1));
  }
  tree = h.render();
  assert.equal(table(tree).props.rows.length, 1);
  assert.equal(pagination(tree).props.total, 21);
  assert.ok(table(tree).props.columns.reduce((sum, column) => sum + column[3], 0) <= 1224);
  change(table(tree).props.rows[0].cells.quantity, "0");
  pagination(h.render()).props.onPageChange(1);
  find(h.render(), n => n.type === "form" && n.props.id === "material-request").props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.equal(h.calls.length, 0);
  tree = h.render();
  assert.equal(pagination(tree).props.page, 2);
  change(table(tree).props.rows[0].cells.quantity, "21");
  pagination(h.render()).props.onPageChange(1);
  tree = h.render();
  change(table(tree).props.rows[0].cells.quantity, "42");
  find(h.render(), n => n.type === "form" && n.props.id === "material-request").props.onSubmit({ preventDefault() {} });
  await h.flush();
  const payload = h.calls.find(call => call.action === "createMaterialRequestAction").args[0];
  assert.equal(payload.items.length, 21);
  assert.equal(payload.items[0].materialId, "material-0");
  assert.equal(payload.items[0].quantityRequested, 42);
  assert.equal(payload.items[20].materialId, "material-20");
  assert.equal(payload.items[20].quantityRequested, 21);
  assert.equal(payload.sourceWarehouseId, "warehouse");
  assert.equal(payload.requesterId, "requester");
});
