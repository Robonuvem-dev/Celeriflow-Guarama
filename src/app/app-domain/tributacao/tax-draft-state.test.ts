import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { invalidSimulationArea, simulationUnitEntries } from "./avaliacoes/simulacao/simulation-unit-draft";
import { itbiPartyEntries } from "./itbi/draft-party-entries";

type Element = { type: unknown; props: Record<string, unknown> };
type Row = { values: Record<string, string>; cells: Record<string, Element> };
const table = Symbol("OperationalTable");
const nodeRequire = createRequire(path.resolve("package.json"));

// Execute the real row builders/callbacks without DOM, CSS, database or actions.
// These tests verify complete draft updates; they do not certify table geometry.
function component(file: string, name: string, hidePanels = false): (props: Record<string, unknown>) => Element {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(path.join("src/app/app-domain/tributacao", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: (id: string) => {
    if (id === "react/jsx-runtime") return nodeRequire(id);
    if (id === "react") return nodeRequire(id);
    if (id.endsWith("OperationalTablePanel")) return { OperationalTablePanel: hidePanels ? () => null : "Panel" };
    if (id.endsWith("TaxOperationalTable")) return { TaxOperationalTable: hidePanels ? () => null : table };
    if (id.endsWith("TaxFormRowsEditor")) return { TaxFormRowsEditor: "FormRows" };
    if (id.endsWith("TaxDraftControls")) return { TaxDraftText: "TextEditor", taxDraftInput: "input" };
    throw new Error(`Unexpected runtime dependency: ${id}`);
  } });
  return exports[name] as (props: Record<string, unknown>) => Element;
}
function findTable(node: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map(findTable).find(Boolean);
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const element = node as Element;
  return element.type === table ? element : findTable(element.props.children);
}
function rows(element: Element): Row[] {
  const found = findTable(element);
  assert.ok(found, "The editor must reach the operational table");
  return found.props.rows as Row[];
}
function change(cell: Element, value: string | boolean) {
  const handler = cell.props.onChange as (event: { target: { value: string; checked: boolean } }) => void;
  handler({ target: { value: String(value), checked: Boolean(value) } });
}

test("simulation GET serializes selection and every area beyond page 1", () => {
  const units = Array.from({ length: 51 }, (_, index) => ({ id: `u${index}`, inscription: `I${index}`, mode: "ENGLOBADA", area: "" }));
  const areas = Object.fromEntries(units.map(unit => [unit.id, ""]));
  areas.u0 = "0"; areas.u20 = "12.345678"; areas.u50 = "91.000001";
  const entries = simulationUnitEntries(units, ["u0", "u20", "u50"], areas);
  const form = new FormData(); entries.forEach(([name, value]) => form.append(name, value));
  assert.deepEqual(form.getAll("unitIds"), ["u0", "u20", "u50"]);
  assert.equal(entries.length, 54);
  assert.equal(form.get("area.u50"), "91.000001");
  assert.equal(form.get("area.u0"), "0");
  assert.equal(units[50].area, "", "serialization must not mutate the source");
});

test("simulation validates an invalid area outside the mounted page", () => {
  const units = Array.from({ length: 41 }, (_, index) => ({ id: String(index), inscription: String(index), mode: "", area: "" }));
  assert.equal(invalidSimulationArea(units, { "40": "-1" })?.id, "40");
  assert.equal(invalidSimulationArea(units, { "40": "0.0000001" })?.id, "40");
  assert.equal(invalidSimulationArea(units, { "40": "0.000001" }), undefined);
});

test("ITBI serializes every seller and buyer using the existing action field names", () => {
  const parties = Array.from({ length: 41 }, (_, index) => ({ taxpayerId: `p${index}`, sharePercent: index === 40 ? "0.000001" : "2" }));
  for (const kind of ["seller", "buyer"] as const) {
    const form = new FormData();
    const entries = itbiPartyEntries(kind, parties); entries.forEach(([name, value]) => form.append(name, value));
    assert.equal(entries.length, 82);
    assert.equal(form.get(kind === "seller" ? "seller" : "buyer0"), "p0");
    assert.equal(form.get(`${kind}40`), "p40");
    assert.equal(form.get(kind === "seller" ? "sellerShare40" : "share40"), "0.000001");
  }
});

test("the form bridge submits all 41 owners to the existing bulk-profile reader", () => {
  const render = component("TaxFormRowsEditor.tsx", "TaxFormRowsEditor", true);
  const owners = Array.from({ length: 41 }, (_, index) => ({ id: String(index), label: `Proprietário ${index}`, initialValues: { owner: `p${index}`, share: index === 40 ? "0.000001" : "2.5", primary: index === 40 } }));
  const props = { id: "test", title: "Proprietários", rows: owners, fields: [
    { key: "owner", label: "Proprietário", name: (index: number) => `owner.${index}` },
    { key: "share", label: "Participação", type: "number", name: (index: number) => `share.${index}` },
    { key: "primary", label: "Principal", type: "radio", name: () => "primaryOwner" },
  ] };
  const html = renderToStaticMarkup(createElement((input: Record<string, unknown>) => render(input) as ReactElement, props));
  const form = new FormData(); form.set("ownerCount", "41");
  for (const match of html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g)) form.append(match[1], match[2]);
  assert.equal(Array.from(html.matchAll(/name="owner\./g)).length, 41);
  assert.equal(form.get("owner.40"), "p40");
  const read = component("imoveis/alteracao-geral/PropertyBulkProfileInput.tsx", "readPropertyBulkProfileGroup") as unknown as (key: string, values: FormData, segments: unknown[]) => { owners: { taxpayerId: string; sharePercent: string; primary: boolean }[] };
  const payload = read("owners", form, []);
  assert.equal(payload.owners.length, 41);
  assert.equal(payload.owners[40].taxpayerId, "p40");
  assert.equal(payload.owners[40].sharePercent, "0.000001");
  assert.equal(payload.owners[40].primary, true);
  assert.equal(payload.owners[0].primary, false);
});

test("field editor reports the global row index when editing page 3", () => {
  const render = component("configuracoes-cadastrais/FiscalFieldsEditor.tsx", "FiscalFieldsEditor");
  const fields = Array.from({ length: 61 }, (_, index) => ({ key: `k${index}`, label: `Campo ${index}`, type: "TEXT", required: false, options: [] }));
  let editedIndex = -1; let editedLabel = "";
  const result = rows(render({ id: "test", title: "Campos", fields, onChange: (index: number, patch: { label: string }) => { editedIndex = index; editedLabel = patch.label; }, onRemove: () => {}, onAdd: () => {} }));
  assert.equal(result.length, 61);
  (result[60].cells.label.props.onChange as (value: string) => void)("Alterado fora da primeira página");
  assert.equal(editedIndex, 60);
  assert.equal(editedLabel, "Alterado fora da primeira página");
});

test("zoning edit keeps every other rule in the publication payload", () => {
  const render = component("configuracoes-cadastrais/ZoningActivitiesInput.tsx", "default");
  const rules = Array.from({ length: 41 }, (_, index) => ({ cnae: String(index).padStart(7, "0"), treatment: "PERMITIDA", condition: "Original" }));
  let changed = rules;
  const result = rows(render({ rules, onChange: (value: typeof rules) => { changed = value; } }));
  (result[40].cells.condition.props.onChange as (value: string) => void)("Condição integral da linha 41");
  assert.equal(changed.length, 41);
  assert.equal(changed[40].condition, "Condição integral da linha 41");
  assert.equal(changed[0].condition, "Original");
  assert.equal(rules[40].condition, "Original");
});

test("payment edit and nested tax selection retain the complete arrays", () => {
  const render = component("motor-fiscal/PaymentOptionsEditor.tsx", "default");
  const options = Array.from({ length: 20 }, (_, index) => ({ code: `O${index}`, name: `Opção ${index}`, dueDate: "2026-12-01", discountPercent: "0", debtCheck: "ALL", debtTaxIds: ["t0", "t40"], legalBasis: "Fundamento" }));
  const taxes = Array.from({ length: 51 }, (_, index) => ({ id: `t${index}`, name: `Tributo ${index}` }));
  let changed = options;
  const result = rows(render({ value: options, taxes, onChange: (value: typeof options) => { changed = value; } }));
  change(result[19].cells.code, "ULTIMA");
  assert.equal(changed.length, 20);
  assert.equal(changed[19].code, "ULTIMA");
  assert.equal(changed[0].code, "O0");
  const updated = rows(render({ value: changed, taxes, onChange: (value: typeof options) => { changed = value; } }));
  const taxEditor = updated[19].cells.taxes.props.children as Element;
  const taxRows = rows((taxEditor.type as (props: Record<string, unknown>) => Element)(taxEditor.props));
  assert.equal(taxRows.length, 51);
  change(taxRows[50].cells.selected, true);
  assert.equal(changed.length, 20);
  assert.equal(changed[19].code, "ULTIMA");
  assert.deepEqual(Array.from(changed[19].debtTaxIds), ["t0", "t40", "t50"]);
});
