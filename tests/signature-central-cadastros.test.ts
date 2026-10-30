import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { CentralDocumentType, CentralOrigin, CentralSigner, CentralSignerInput } from "../src/lib/contracts/signature-central";
import { editSigner, emptySigner, filterSigners, fromLocalDateTime, prefillOrigin, serializeSigner, signerInputSchema, signerValidity, toLocalDateTime } from "../src/app/app-domain/assinatura-digital/usuarios/cadastro-model";
import { documentTypeInputSchema, filterDocumentTypes } from "../src/app/app-domain/assinatura-digital/documentos/cadastro-model";

const base = "src/app/app-domain/assinatura-digital";
const now = Date.parse("2026-10-29T12:00:00Z");
const signer: CentralSigner = { id: "signer-1", kind: "SERVIDOR", name: "Maria", role: "Analista", documentId: "529.982.247-25", phone: "(11) 2222-3333", mobile: "", email: "maria@example.org", validUntil: "2026-10-30T02:59:59.123Z", active: true, employeeId: "rh-1", personId: null, accountUserId: null, hasPassword: true };
const documentType: CentralDocumentType = { id: "type-1", name: "Ofício", description: "Comunicação", active: true };

function loadModule<T>(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const filename = resolve(path);
  const nativeRequire = createRequire(filename);
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { exports: loaded.exports, module: loaded, Date, Error, URL, URLSearchParams, Response, Request, ...globals,
    require: (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name) }, { filename });
  return loaded.exports as T;
}

test("datas: horário local faz roundtrip sem perder milissegundos, limites e validade inválida", () => {
  assert.equal(fromLocalDateTime(toLocalDateTime(signer.validUntil)), signer.validUntil);
  assert.equal(toLocalDateTime(""), ""); assert.equal(toLocalDateTime("inválida"), "");
  assert.equal(fromLocalDateTime(""), ""); assert.equal(fromLocalDateTime("inválida"), "");
  assert.equal(signerValidity({ validUntil: new Date(now + 1).toISOString() }, now), "VALID");
  assert.equal(signerValidity({ validUntil: new Date(now).toISOString() }, now), "EXPIRED");
  assert.equal(signerValidity({ validUntil: "inválida" }, now), "EXPIRED");
  assert.equal(signerInputSchema.safeParse({ ...editSigner(signer), validUntil: "2026-02-30T10:00:00Z" }).success, false);
  assert.equal(signerInputSchema.safeParse({ ...editSigner(signer), validUntil: "2026-10-29" }).success, false);
});

test("DTO e gravação usam allowlist, senha nunca vem da leitura; senha vazia preservada na edição", () => {
  const polluted = { ...signer, validUntil: new Date(signer.validUntil), password: "segredo", passwordHash: "hash", admin: true };
  const serialized = serializeSigner(polluted as unknown as CentralSigner);
  assert.equal(serialized.validUntil, signer.validUntil);
  assert.equal("passwordHash" in serialized, false); assert.equal("password" in serialized, false);
  const draft = editSigner(polluted as unknown as CentralSigner);
  assert.equal(draft.password, ""); assert.equal("passwordHash" in draft, false);
  const parsed = signerInputSchema.parse({ ...draft, admin: true, passwordHash: "bad" });
  assert.equal("admin" in parsed, false); assert.equal("passwordHash" in parsed, false);
  assert.equal(parsed.password, "");
  assert.equal(signerInputSchema.safeParse({ ...emptySigner(), name: "Pessoa", documentId: "123", validUntil: signer.validUntil }).success, false);
  assert.equal(documentTypeInputSchema.safeParse({ name: "  ", description: "", active: true }).success, false);
  assert.equal("admin" in documentTypeInputSchema.parse({ name: "Ofício", description: "", active: true, admin: true }), false);
});

test("normalização: cidadão manual CPF/CNPJ sem pessoa, importação opcional e RH obrigatório", () => {
  const manual = { ...emptySigner(), name: "  Pessoa manual  ", role: "  Representante  ", email: "  Manual@Example.org  ", phone: "  1133334444  ", mobile: "  11999998888  ", accountUserId: "  ", validUntil: "2099-01-01T00:00:00Z", password: "senha-inicial" };
  for (const documentId of ["529.982.247-25", "04.252.011/0001-10"]) {
    const parsed = signerInputSchema.parse({ ...manual, documentId });
    assert.equal(parsed.name, "Pessoa manual"); assert.equal(parsed.role, "Representante");
    assert.equal(parsed.documentId, documentId.replace(/\D/g, "")); assert.equal(parsed.phone, "1133334444");
    assert.equal(parsed.email, "manual@example.org"); assert.equal(parsed.employeeId, null); assert.equal(parsed.personId, null); assert.equal(parsed.accountUserId, null);
    assert.equal(parsed.validUntil, "2099-01-01T00:00:00.000Z");
  }
  assert.equal(signerInputSchema.safeParse({ ...manual, documentId: "52998224725", personId: "person-1" }).success, true);
  assert.equal(signerInputSchema.safeParse({ ...manual, documentId: "52998224725", kind: "SERVIDOR" }).success, false);
  assert.equal(signerInputSchema.safeParse({ ...manual, documentId: "52998224725", kind: "SERVIDOR", employeeId: "rh-1" }).success, true);
  assert.equal(signerInputSchema.safeParse({ ...manual, documentId: "52998224725", employeeId: "rh-1" }).success, false);
  for (const documentId of ["11111111111", "12345678900", "04.252.011/0001-11", "a52998224725"]) assert.equal(signerInputSchema.safeParse({ ...manual, documentId }).success, false);
  for (const patch of [{ name: "a".repeat(201) }, { name: "A" }, { name: "Pessoa\u0001manual" }, { role: "a".repeat(161) }, { phone: "a".repeat(41) }, { phone: "1234567" }, { mobile: "a".repeat(41) }, { password: "1234567" }, { password: "é".repeat(513) }]) assert.equal(signerInputSchema.safeParse({ ...manual, documentId: "52998224725", ...patch }).success, false);
});

test("candidato só preenche identidade/contato, preservando senha, validade, conta, estado e ID de edição", () => {
  const draft = { ...editSigner(signer), password: "digitada", active: false, accountUserId: "account-1" };
  const origin: CentralOrigin = { id: "person-1", kind: "CIDADAO", name: "Joana", role: "Cidadã", documentId: "987", phone: "111", mobile: "222", email: "joana@example.org", employeeId: null, personId: "person-1" };
  const next = prefillOrigin(draft, origin);
  assert.equal(next.id, signer.id); assert.equal(next.password, "digitada");
  assert.equal(next.validUntil, signer.validUntil); assert.equal(next.accountUserId, "account-1");
  assert.equal(next.active, false); assert.equal(next.employeeId, null); assert.equal(next.personId, "person-1");
  assert.equal(next.name, "Joana"); assert.equal(next.role, "Cidadã"); assert.equal(next.phone, "111");
});

test("busca e estado/validade antes do recorte: 20/20/1, busca no último registro e CPF sem máscara", () => {
  const rows = Array.from({ length: 41 }, (_, index) => ({ ...signer, id: `s-${index}`, name: `Pessoa ${index}`, active: index !== 40, validUntil: index === 40 ? new Date(now - 1).toISOString() : signer.validUntil }));
  const filtered = filterSigners(rows, "", "ALL", "ALL", now);
  assert.deepEqual([0, 20, 40].map(offset => filtered.slice(offset, offset + 20).length), [20, 20, 1]);
  assert.equal(filterSigners(rows, "Pessoa 40", "ALL", "EXPIRED", now)[0].id, "s-40");
  assert.equal(filterSigners(rows, "Pessoa 40", "ACTIVE", "ALL", now).length, 0);
  assert.equal(filterSigners(rows, "52998224725", "ALL", "VALID", now).length, 40);
  assert.equal(filterSigners(rows, "Analista", "INACTIVE", "EXPIRED", now).length, 1);
  const types = Array.from({ length: 41 }, (_, index) => ({ ...documentType, id: `t-${index}`, description: `Descrição ${index}`, active: index !== 40 }));
  assert.equal(filterDocumentTypes(types, "Descrição 40", "ALL")[0].id, "t-40");
  assert.equal(filterDocumentTypes(types, "Descrição 40", "ACTIVE").length, 0);
});

test("actions: create/update exatos, filtro de payload, retorno seguro, erros e bloqueio antes do service", async () => {
  for (const kind of ["usuarios", "documentos"] as const) {
    const calls: string[] = []; let denied = false; let fail = false; let payload: Record<string, unknown> = {};
    const exported = kind === "usuarios" ? "saveSignerAction" : "saveDocumentTypeAction";
    const service = kind === "usuarios" ? "saveCentralSigner" : "saveCentralDocumentType";
    const model = kind === "usuarios" ? await import("../src/app/app-domain/assinatura-digital/usuarios/cadastro-model") : await import("../src/app/app-domain/assinatura-digital/documentos/cadastro-model");
    const actions = loadModule<Record<string, (input: unknown) => Promise<{ error: string | null; signer?: CentralSigner; documentType?: CentralDocumentType }>>>(`${base}/${kind}/actions.ts`, {
      "@/lib/platform/tenant-context": { getTenantContextForModuleOperation: async (module: string, operation: string) => { calls.push(`${module}:${operation}`); if (denied) throw new Error("Acesso negado"); return { user: { id: "ator" } }; } },
      "@/lib/signatures/central-service": { [service]: async (_context: unknown, input: Record<string, unknown>) => { calls.push("save"); payload = input; if (fail) throw new Error("Vínculo inválido"); return { ...(kind === "usuarios" ? signer : documentType), password: "não retornar", passwordHash: "hash" }; } },
      "next/cache": { revalidatePath: (path: string) => calls.push(path) }, "./cadastro-model": model,
    });
    const update = kind === "usuarios" ? editSigner(signer) : documentType;
    const create = { ...update, id: undefined, password: "inicial-123", passwordHash: "malicioso", admin: true };
    const result = await actions[exported](create);
    assert.equal(result.error, null); assert.equal(calls[0], "ASSINATURA_DIGITAL:create");
    assert.equal("passwordHash" in payload, false); assert.equal("admin" in payload, false);
    assert.equal("passwordHash" in (result.signer ?? result.documentType ?? {}), false);
    assert.equal("password" in (result.signer ?? result.documentType ?? {}), false);
    calls.length = 0;
    assert.equal((await actions[exported](update)).error, null); assert.equal(calls[0], "ASSINATURA_DIGITAL:update");
    if (kind === "usuarios") assert.equal(payload.password, "");
    if (kind === "usuarios") {
      const manual = { ...emptySigner(), name: " Cidadão manual ", role: " Representante ", documentId: "04.252.011/0001-10", validUntil: "2099-01-01T00:00:00Z", password: "senha-inicial" };
      assert.equal((await actions[exported](manual)).error, null);
      assert.equal(payload.kind, "CIDADAO"); assert.equal(payload.personId, null); assert.equal(payload.employeeId, null);
      assert.equal(payload.name, "Cidadão manual"); assert.equal(payload.role, "Representante"); assert.equal(payload.documentId, "04252011000110");
    }
    calls.length = 0; fail = true;
    assert.match((await actions[exported](update)).error ?? "", /Vínculo inválido/);
    assert.equal(calls.some(call => call.startsWith("/")), false);
    calls.length = 0; denied = true;
    assert.match((await actions[exported](update)).error ?? "", /Acesso negado/);
    assert.deepEqual(calls, ["ASSINATURA_DIGITAL:update"]);
    denied = false; calls.length = 0;
    assert.ok((await actions[exported]({ ...update, name: "" })).error);
    assert.equal(calls.includes("save"), false);
  }
});

test("API origens: guard, mínimo 2, enum, limite20, fonte backend e resposta mínima/no-store", async () => {
  class AccessError extends Error { constructor(message: string, public status: number) { super(message); } }
  let denied = false; const calls: string[] = [];
  const origin: CentralOrigin = { ...signer, id: "rh-1" };
  const route = loadModule<{ GET: (request: Request) => Promise<Response> }>("src/app/api/assinatura-digital/origens/route.ts", {
    "@/lib/platform/tenant-context": { AccessError, getTenantContextForModule: async (module: string) => { calls.push(module); if (denied) throw new AccessError("Negado", 403); return {}; } },
    "@/lib/signatures/central-service": { searchCentralOrigins: async (_context: unknown, kind: string, query: string) => { calls.push(`${kind}:${query}`); return Array.from({ length: 25 }, (_, i) => ({ ...origin, id: `${i}`, passwordHash: "hash", privateData: "privado" })); } },
    "@/app/app-domain/assinatura-digital/usuarios/cadastro-model": await import("../src/app/app-domain/assinatura-digital/usuarios/cadastro-model"),
  });
  const get = (query: string) => route.GET(new Request(`https://app.local/api/assinatura-digital/origens?${query}`));
  for (const query of ["kind=SERVIDOR&q=a", "kind=ADMIN&q=Maria", "kind=CIDADAO&q=%20%20", `kind=SERVIDOR&q=${"a".repeat(101)}`]) assert.equal((await get(query)).status, 400);
  assert.equal(calls.length, 4);
  for (const kind of ["SERVIDOR", "CIDADAO"]) {
    const response = await get(`kind=${kind}&q=%20Ma%20`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json(); assert.equal(data.origins.length, 20);
    assert.equal("passwordHash" in data.origins[0], false); assert.equal("privateData" in data.origins[0], false);
    assert.ok(calls.includes(`${kind}:Ma`));
  }
  denied = true; calls.length = 0;
  assert.equal((await get("kind=SERVIDOR&q=Ma")).status, 403); assert.deepEqual(calls, ["ASSINATURA_DIGITAL"]);
});

// Small hook harness: exercises actual event handlers and component state without a DOM or a DB.
type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...["children", "toolbar", "actions", "pagination", "footer"].flatMap(key => elements(element.props[key]))];
}
function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}
function clientHarness(kind: "usuarios" | "documentos", save: (input: unknown) => Promise<unknown>, permissions = { canCreate: true, canUpdate: true }) {
  const values: unknown[] = []; let cursor = 0; const promises: Promise<void>[] = [];
  const hooks = {
    useState: (initial: unknown) => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useEffect: () => {}, useTransition: () => [false, (callback: () => Promise<void>) => promises.push(callback())],
  };
  const name = kind === "usuarios" ? "UsuariosClient" : "DocumentosClient";
  const model = kind === "usuarios" ? { editSigner, emptySigner, filterSigners, fromLocalDateTime, prefillOrigin, signerValidity, toLocalDateTime } : { filterDocumentTypes };
  const components = Object.fromEntries(["OperationalListFrame", "OperationalFilters", "OperationalPagination", "OperationalTable", "Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map(key => [key, key]));
  const client = loadModule<Record<string, (props: unknown) => unknown>>(`${base}/${kind}/${name}.tsx`, {
    react: hooks, "./cadastro-model": model,
    "./actions": { saveSignerAction: save, saveDocumentTypeAction: save },
    "@/lib/operational-tables": { OPERATIONAL_PAGE_SIZE: 20 },
    "@/components/app-ui/operational/OperationalListFrame": components,
    "@/components/app-ui/operational/OperationalTable": components,
    "@/components/ui/dialog": components,
    "@/components/app-ui/operational/OperationalPagedContent": { OperationalPagedContent: "OperationalPagedContent" },
    "@/components/app-ui/operational/OperationalWorkspace": { useOperationalWorkspace: () => ({ device: "desktop" }) },
    "@/components/app-ui/operational/operational.module.css": {},
    "lucide-react": { Pencil: "Pencil", Plus: "Plus" },
  });
  const props = { initialRows: kind === "usuarios" ? [signer, { ...signer, id: "signer-2", name: "Outra pessoa" }] : [documentType, { ...documentType, id: "type-2", name: "Outro tipo" }], initialNow: now, ...permissions };
  const render = () => { cursor = 0; return elements(client[name](props)); };
  const find = (predicate: (element: Element) => boolean) => { const result = render().find(predicate); assert.ok(result); return result; };
  const table = () => find(element => element.type === "OperationalTable");
  const edit = (index: number) => { const rows = table().props.rows as { actions: unknown }[]; const button = elements(rows[index].actions).find(element => element.type === "button"); assert.ok(button); (button.props.onClick as () => void)(); };
  const field = (label: string) => { const element = find(element => element.type === "label" && text(element).startsWith(label)); const input = elements(element.props.children).find(element => element.type === "input" || element.type === "textarea"); assert.ok(input); return input; };
  return { render, find, edit, field, table, flush: async () => { await Promise.all(promises.splice(0)); } };
}

test("UI real: erro retornado e falha de rede preservam rascunho/ID, fechamento e troca de seleção; retry salva o mesmo ID", async () => {
  for (const kind of ["usuarios", "documentos"] as const) {
    const received: unknown[] = []; let attempt = 0;
    const harness = clientHarness(kind, async input => {
      received.push(input); attempt++;
      if (attempt === 1) return { error: "Falha de validação" };
      if (attempt === 2) throw new Error("Falha de rede");
      return kind === "usuarios" ? { error: null, signer: { ...signer, name: "Rascunho", active: false } } : { error: null, documentType: { ...documentType, name: "Rascunho", active: false } };
    });
    const submit = async () => { (harness.find(element => element.type === "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); await harness.flush(); };
    harness.edit(0);
    (harness.field("Nome").props.onChange as (event: unknown) => void)({ target: { value: "Rascunho" } });
    await submit();
    assert.match(text(harness.find(element => element.props.role === "alert")), /Falha de validação/);
    assert.equal(harness.field("Nome").props.value, "Rascunho");
    (harness.find(element => element.type === "Dialog").props.onOpenChange as (value: boolean) => void)(false);
    harness.edit(1); assert.notEqual(harness.field("Nome").props.value, "Rascunho");
    harness.edit(0); assert.equal(harness.field("Nome").props.value, "Rascunho");
    await submit(); assert.match(text(harness.find(element => element.props.role === "alert")), /Falha de rede/);
    assert.equal(harness.field("Nome").props.value, "Rascunho");
    await submit();
    assert.equal(harness.find(element => element.type === "Dialog").props.open, false);
    assert.ok(received.every(input => (input as CentralSignerInput).id === (kind === "usuarios" ? signer.id : documentType.id)));
    const rows = harness.table().props.rows as { values: Record<string, string> }[];
    assert.equal(rows[0].values.name, "Rascunho"); assert.equal(rows[0].values.state, "Inativo");
  }
});

test("UI: consulta desabilita edição e oculta cadastro; create e update são independentes", () => {
  for (const kind of ["usuarios", "documentos"] as const) {
    for (const permissions of [{ canCreate: false, canUpdate: false }, { canCreate: true, canUpdate: false }, { canCreate: false, canUpdate: true }]) {
      const harness = clientHarness(kind, async () => { throw new Error("Não deveria gravar"); }, permissions);
      const hasCreate = harness.render().some(element => element.type === "button" && text(element).includes("Cadastrar"));
      assert.equal(hasCreate, permissions.canCreate);
      const rows = harness.table().props.rows as { actions: unknown }[];
      const button = elements(rows[0].actions).find(element => element.type === "button");
      assert.equal(button?.props.disabled, !permissions.canUpdate);
    }
  }
});

test("UI: bloqueia reenvio e fechamento durante gravação; não trata resposta sem registro como sucesso", async () => {
  for (const kind of ["usuarios", "documentos"] as const) {
    let calls = 0;
    let release: (value: unknown) => void = () => { throw new Error("Ainda não iniciou"); };
    const harness = clientHarness(kind, () => { calls++; return new Promise(resolve => { release = resolve; }); });
    harness.edit(0);
    const submit = () => (harness.find(element => element.type === "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    submit(); submit();
    assert.equal(calls, 1);
    (harness.find(element => element.type === "Dialog").props.onOpenChange as (value: boolean) => void)(false);
    assert.equal(harness.find(element => element.type === "Dialog").props.open, true);
    release({ error: null }); await harness.flush();
    assert.match(text(harness.find(element => element.props.role === "alert")), /não confirmou/);
    assert.equal(harness.find(element => element.type === "Dialog").props.open, true);
    assert.equal(harness.field("Nome").props.value, kind === "usuarios" ? signer.name : documentType.name);
  }
});
