import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
type Row = { id: string; values: Record<string, string>; cells?: Record<string, Element>; actions?: Element };

/** Execute owner state/handlers; never import the domain's server dependencies. */
function client(file: string, action: (payload: unknown) => Promise<unknown> = async () => { throw new Error("Unexpected action"); }) {
  const slots: unknown[] = []; let cursor = 0;
  const state = (initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const exports: Record<string, (props: Record<string, unknown>) => Element> = {};
  const requireMock = (name: string) => {
    if (name === "react") return { useState: state };
    if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: Element["props"]) => ({ type, props }), jsxs: (type: unknown, props: Element["props"]) => ({ type, props }), Fragment: "Fragment" };
    if (name === "next/link") return { __esModule: true, default: "Link" };
    if (name === "firebase/auth") return { updatePassword: () => { throw new Error("No Firebase in an offline test"); } };
    if (name === "@/lib/firebase/client") return { auth: { currentUser: null } };
    if (name === "@/lib/saude/health-access-policy") return { isStrongHealthPassword: () => false };
    if (name === "./actions") return { saveHealthUserAccess: action };
    if (name.endsWith("operational-columns")) return { healthColumn: (key: string) => ({ key }) };
    if (name === "lucide-react" || /OperationalTable$|OperationalWorkspace$|OperationalListFrame$|HealthPageTools$/.test(name)) return new Proxy({}, { get: (_, key) => key });
    throw new Error(`Unexpected runtime dependency: ${name}`);
  };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  class TestFormData {
    constructor(private fields: Map<string, string[]>) {}
    get(name: string) { return this.fields.get(name)?.[0] ?? null; }
    getAll(name: string) { return this.fields.get(name) ?? []; }
  }
  vm.runInNewContext(code, { exports, require: requireMock, FormData: TestFormData });
  return (props: Record<string, unknown>, name = "default") => { cursor = 0; return exports[name](props); };
}
function elements(value: unknown): Element[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(elements);
  const own = "type" in value && "props" in value ? [value as Element] : [];
  return [...own, ...Object.values(value).flatMap(elements)];
}
function find(value: unknown, predicate: (element: Element) => boolean) {
  const element = elements(value).find(predicate);
  assert.ok(element, "Expected rendered control");
  return element;
}
const table = (tree: Element) => find(tree, element => element.type === "OperationalTable");

test("Saúde: denied admin access exposes no data/actions; action errors preserve the current editor and full unit scope", async () => {
  let response: { error?: string } = { error: "Permissão revogada" };
  const calls: unknown[] = [];
  const render = client("src/app/app-domain/saude/administracao/AccessTab.tsx", async payload => { calls.push(payload); return response; });
  const units = Array.from({ length: 41 }, (_, index) => ({ id: `unit-${index}`, name: `Unidade ${index}`, type: "UBS" }));
  const row = { id: "user", nome: "Pessoa autorizada", email: "user@example.invalid", personName: "Pessoa", cpf: "123", profileName: "Gestão", perfilId: "profile", employeeId: "employee", ativo: true, canView: true, canEdit: false, scopes: units.map(unit => ({ unitId: unit.id, unitName: unit.name, startTime: "08:00", endTime: "17:00", weekdays: "1,2", validFrom: "2026-01-01", validUntil: "2026-12-31", isActive: true })) };
  const props = { rows: [row], profiles: [{ id: "profile", name: "Gestão" }], employees: [], units, usage: [], usageFrom: "2026-01-01", usageUntil: "2026-12-31", canManage: false };
  const denied = render(props);
  assert.equal(elements(denied).some(element => element.type === "OperationalTable" || element.type === "button"), false);
  assert.equal(calls.length, 0);
  const allowed = { ...props, canManage: true };
  const rows = table(render(allowed)).props.rows as Row[];
  assert.ok(rows[0].values.scopes.includes("Unidade 40"), "Every unit/time/validity remains readable.");
  (rows[0].actions!.props.onClick as () => void)();
  const form = () => find(render(allowed), element => element.type === "form" && typeof element.props.onSubmit === "function");
  const fields = new Map<string, string[]>([["employeeId", ["employee"]], ["perfilId", ["profile"]], ["unitIds", units.map(unit => unit.id)], ["weekdays", ["1", "2"]], ["canView", ["on"]], ["startTime", ["08:00"]], ["endTime", ["17:00"]]]);
  await (form().props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: fields });
  assert.equal(calls.length, 1);
  const payload = calls[0] as { unitIds: string[]; weekdays: number[]; canView: boolean; canEdit: boolean };
  assert.deepEqual(Array.from(payload.unitIds), units.map(unit => unit.id));
  assert.deepEqual(Array.from(payload.weekdays), [1, 2]);
  assert.equal(payload.canView, true);
  assert.equal(payload.canEdit, false);
  assert.ok(elements(render(allowed)).some(element => element.props.children === "Permissão revogada"));
  assert.ok(form(), "An error must keep the editor mounted.");
  response = {};
  await (form().props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: fields });
  assert.equal(elements(render(allowed)).some(element => element.type === "form" && typeof element.props.onSubmit === "function"), false);
});

test("AIH/APAC: real selection handlers retain IDs from pages 1/2 and discard a now-ineligible selection", () => {
  const render = client("src/app/app-domain/saude/producao/laudos/TreatmentReportsTable.tsx");
  const reports = Array.from({ length: 41 }, (_, index) => ({ id: `report-${index}`, patient: `Paciente ${index}`, unit: "UBS", status: "APROVADA", paid: false, authorization: null }));
  const props = { reports: reports.slice(0, 20) };
  let tree = render(props, "TreatmentReportsTable");
  const first = (table(tree).props.rows as Row[])[0];
  (first.cells!.selection.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = render({ reports: reports.slice(20, 40) }, "TreatmentReportsTable");
  const next = (table(tree).props.rows as Row[])[0];
  (next.cells!.selection.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = render(props, "TreatmentReportsTable");
  const submitted = elements(tree).filter(element => element.type === "input" && element.props.type === "hidden");
  assert.deepEqual(submitted.map(element => element.props.value), ["report-0", "report-20"]);
  assert.ok(submitted.every(element => element.props.name === "reportId" && element.props.form === "bulk-authorization"));
  assert.equal((table(tree).props.rows as Row[])[0].cells!.selection.props.checked, true);
  const updated = { ...reports[0], status: "CANCELADA" };
  tree = render({ reports: [updated, ...reports.slice(1, 20)] }, "TreatmentReportsTable");
  assert.deepEqual(elements(tree).filter(element => element.type === "input" && element.props.type === "hidden").map(element => element.props.value), ["report-20"]);
  assert.equal((table(tree).props.rows as Row[])[0].cells!.selection, null);
});
