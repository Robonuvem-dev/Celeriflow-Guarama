import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
type ActionCall = { operation: "save" | "create"; input: Record<string, unknown> };
const nodeRequire = createRequire(path.resolve("package.json"));

function find(node: unknown, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const element = node as Element;
  return predicate(element) ? element : find(element.props.children, predicate);
}

function load(file: string, dependencies: Record<string, unknown>, formData: typeof FormData): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(path.join("src/app/app-domain/tributacao", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, FormData: formData, require: (id: string) => {
    if (id === "react/jsx-runtime") return nodeRequire(id);
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  return exports;
}

/**
 * Exercise the real editor effect and the real parent's onSubmit in event order:
 * the native form listener runs before React's delegated bubbling handler.
 * Only layout widgets/hooks and the external action boundary are substituted.
 * The 21-row fixture stresses the UI paging contract, not policy provisioning.
 */
async function submitProfile(creating: boolean, invalidLastItem: boolean) {
  const form = new EventTarget();
  const entries = new FormData();
  const effects: (() => void | (() => void))[] = [];
  const transitions: Promise<unknown>[] = [];
  const messages: string[] = [];
  const calls: ActionCall[] = [];
  let formDataReads = 0;
  class SubmittedFormData extends FormData {
    constructor(target?: unknown) {
      super();
      assert.equal(target, form);
      formDataReads++;
      for (const [name, value] of entries) this.append(name, value);
    }
  }
  const hooks = {
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, (value: unknown) => { if (typeof value === "string") messages.push(value); }],
    useRef: () => ({ current: { closest: (selector: string) => { assert.equal(selector, "form"); return form; } } }),
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    useTransition: () => [false, (callback: () => unknown) => { transitions.push(Promise.resolve(callback())); }],
  };
  const editor = load("TaxFormRowsEditor.tsx", {
    react: hooks,
    "@/components/app-ui/operational/OperationalTablePanel": { OperationalTablePanel: "Panel" },
    "./TaxOperationalTable": { TaxOperationalTable: "Table" },
    "./TaxDraftControls": { taxDraftInput: "input" },
  }, SubmittedFormData).TaxFormRowsEditor as (props: Record<string, unknown>) => Element;
  const render = load("imoveis/[id]/perfil/PropertyProfileClient.tsx", {
    react: hooks,
    "next/link": { default: "Link" },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/components/app-ui/GeographicPointPicker": { default: "Map" },
    "@/components/app-ui/operational/OperationalTablePanel": { OperationalTablePanel: "Panel" },
    "../../../TaxOperationalTable": { TaxOperationalTable: "Table" },
    "../../../TaxDraftControls": { taxDraftInput: "input" },
    "../../../TaxFormRowsEditor": { TaxFormRowsEditor: editor },
    "./actions": {
      savePropertyProfileAction: async (input: Record<string, unknown>) => { calls.push({ operation: "save", input }); return {}; },
      createPropertyWithProfileAction: async (input: Record<string, unknown>) => { calls.push({ operation: "create", input }); return { id: "created" }; },
    },
  }, SubmittedFormData).default as (props: Record<string, unknown>) => Element;

  const segments = Array.from({ length: 21 }, (_, index) => ({ key: `s${index}`, label: `Parte ${index + 1}`, width: 4, numeric: true }));
  const owners = Array.from({ length: 21 }, (_, index) => ({ taxpayerId: `owner${index}`, sharePercent: index === 20 ? "80" : "1", primary: index === 20 }));
  const parts = Object.fromEntries(segments.map((segment, index) => [segment.key, invalidLastItem && index === 20 ? "" : String(index + 1)]));
  const updatedAt = "2026-10-29T00:00:00.000Z";
  const parent = render({
    creating, property: { id: "estate", inscription: "001", updatedAt, taxpayerId: "owner0" },
    version: 7, profile: { budgetUnitId: "ug", kind: "Terreno", owners, inscriptionParts: parts, correspondenceAddress: {} },
    units: [{ id: "ug", entityId: "entity", label: "UG" }],
    policies: [{ budgetUnitId: "ug", segments, requireProcess: false }],
    taxpayers: owners.map(owner => ({ id: owner.taxpayerId, label: owner.taxpayerId })), properties: [], processes: [], documents: [],
  });
  const parentForm = find(parent, element => element.type === "form");
  assert.ok(parentForm);
  const editorElement = find(parentForm, element => element.type === editor);
  assert.ok(editorElement);
  const editorTree = editor(editorElement.props);
  // Closed Panel: no editable table cells are mounted. Hidden inputs still form
  // the complete submission; collect only the editor's actual outside inputs.
  const collect = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const element = node as Element;
    if (element.type === "Panel") return;
    if (element.type === "input" && element.props.type === "hidden") entries.append(String(element.props.name), String(element.props.value));
    collect(element.props.children);
  };
  collect(editorTree);
  assert.equal(Array.from(entries.keys()).filter(key => key.startsWith("part.")).length, 21);
  for (const [name, value] of Object.entries({ street: "Rua Nuvem", number: "10", complement: "", neighborhood: "Centro", city: "Guaramá", state: "RS", zipCode: "99000000", floors: "2", frontSetback: "1", sideSetback: "0.5", reason: "Correção cadastral", "native.streetName": "Rua Nuvem", "native.landArea": "100", "native.builtArea": "50" })) entries.set(name, value);
  entries.append("documents", "doc1"); entries.append("documents", "doc2");

  const cleanups = effects.map(effect => effect());
  let parentInvocations = 0;
  let preventedBeforeParent = false;
  const onSubmit = parentForm.props.onSubmit as (event: { readonly defaultPrevented: boolean; currentTarget: EventTarget; preventDefault: () => void }) => void;
  form.addEventListener("submit", event => {
    parentInvocations++;
    preventedBeforeParent = event.defaultPrevented;
    onSubmit({ get defaultPrevented() { return event.defaultPrevented; }, currentTarget: form, preventDefault: () => event.preventDefault() });
  });
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  await Promise.all(transitions);
  cleanups.forEach(cleanup => cleanup?.());
  return { calls, formDataReads, parentInvocations, preventedBeforeParent, messages, updatedAt };
}

for (const creating of [false, true]) {
  const operation = creating ? "create" : "save";
  test(`${operation}: invalid item 21 cancels the real parent submission before any action`, async () => {
    const result = await submitProfile(creating, true);
    assert.equal(result.parentInvocations, 1, "the parent must actually run, even for an already cancelled event");
    assert.equal(result.preventedBeforeParent, true, "the real editor listener must cancel the native event");
    assert.ok(result.messages.some(message => message.includes("Parte 21")));
    assert.equal(result.calls.length, 0);
    assert.equal(result.formDataReads, 0, "respect cancellation before constructing FormData");
  });
  test(`${operation}: valid items on all pages produce one complete action payload`, async () => {
    const result = await submitProfile(creating, false);
    assert.equal(result.preventedBeforeParent, false);
    assert.equal(result.parentInvocations, 1);
    assert.equal(result.formDataReads, 1);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].operation, operation);
    const profile = (creating ? result.calls[0].input.profile : result.calls[0].input) as Record<string, unknown>;
    const parts = profile.inscriptionParts as Record<string, string>;
    assert.equal(Object.keys(parts).length, 21);
    assert.equal(parts.s0, "1"); assert.equal(parts.s20, "21");
    assert.equal((profile.owners as unknown[]).length, 21);
    assert.equal(profile.expectedVersion, 7);
    assert.equal(profile.expectedUpdatedAt, result.updatedAt);
    assert.deepEqual(Array.from(profile.documentIds as string[]), ["doc1", "doc2"]);
  });
}
