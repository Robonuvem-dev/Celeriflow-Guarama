import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";

const f = { events: [], denied: false, gedDenied: false, missing: false, conflict: false, download: true };
let route;
before(async () => {
  const stubs = {
    "@/db/client": 'export const databaseConnection={db:{}};',
    "@/db/transaction": 'export async function withDatabaseTransaction(c,work){let n=0;const tx={select(){n++;const chain={from(){return chain},where(){return chain},orderBy(){return chain},innerJoin(){return chain},limit(){return chain},then(ok,bad){return Promise.resolve(n===1?(f.missing?[]:[{id:"legal",type:"Lei",number:"1"}]):n===2?[{id:"lv",versionNumber:3}]:f.download?[{documentId:"doc",versionId:"pinned-v1"}]:[]).then(ok,bad)}};return chain}};return work(tx);}',
    "@/lib/platform/tenant-context": 'export class AccessError extends Error {constructor(message,status=403){super(message);this.status=status;}}export async function getTenantContextForModule(module){f.events.push(["legal",module]);if(f.denied)throw new AccessError("Negado");return {user:{id:"a"}};}export async function getTenantContextForModuleOperation(module,op){f.events.push(["operation",op]);return getTenantContextForModule(module);}',
    "@/lib/documents/ged-access": 'import {AccessError} from "@/lib/platform/tenant-context";export async function getGedContext(cap){f.events.push(["ged",cap]);if(f.gedDenied)throw new AccessError("GED negado");return {user:{id:"a"}};}',
    "@/db/repositories/registry/legal-documents": 'import {LegalDocumentError} from "@/lib/cadastros/legal-document-policy";export async function requireLegalDocumentSchema(){f.events.push(["schema"]);}export async function bindLegalDocument(tx,actor,input){f.events.push(["bind",input]);if(f.conflict)throw new LegalDocumentError("Versão alterada",409);return "link";}export async function listLegalDocuments(){return {rows:[],page:1,total:0};}',
    "@/db/repositories/documents/ged": 'export async function requireManagedDocument(ctx,id){f.events.push(["object",id]);if(f.gedDenied)throw Error("PRIVATE_DB");return {};}export async function listManagedDocuments(){f.events.push(["list"]);return {documents:[],page:1,total:0};}',
  };
  const bundle = await build({ entryPoints: ["src/app/api/cadastros/textos-juridicos/documentos/route.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", logLevel: "silent", plugins: [{ name: "legal-document-boundary", setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "boundary" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const compiled = { exports: {} }; new Function("require", "module", "exports", "f", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports, f); route = compiled.exports;
});
function reset(overrides = {}) { Object.assign(f, { events: [], denied: false, gedDenied: false, missing: false, conflict: false, download: true }, overrides); }
const url = "https://municipal.fixture/api/cadastros/textos-juridicos/documentos";
const input = { legalTextId: "legal", legalTextVersionId: "lv", expectedVersion: 3, documentId: "doc", documentVersionId: "v1", role: "ORIGINAL" };
function post(data = input, origin = "https://municipal.fixture") { return new Request(url, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
test("leitura/escrita exigem CADASTROS e GED antes de IO", async () => {
  for (const denied of [{ denied: true }, { gedDenied: true }]) {
    reset(denied); assert.equal((await route.GET(new Request(`${url}?legalTextId=legal`))).status, 403); assert.equal(f.events.some(e => e[0] === "schema"), false);
    reset(denied); assert.equal((await route.POST(post())).status, 403); assert.equal(f.events.some(e => e[0] === "bind"), false);
  }
});
test("origem externa, campos inválidos e corpo excessivo não vinculam arquivos", async () => {
  reset(); assert.equal((await route.POST(post(input, "https://other.fixture"))).status, 403); assert.equal(f.events.length, 0);
  for (const data of [{ ...input, expectedVersion: -1 }, { ...input, role: "OTHER" }, { ...input, documentId: "x".repeat(5000) }]) { reset(); assert.equal((await route.POST(post(data))).status, 400); assert.equal(f.events.some(e => e[0] === "bind"), false); }
});
test("vínculo bem-sucedido e conflito mantêm códigos HTTP e cache privado", async () => {
  reset(); const response = await route.POST(post()); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.deepEqual(f.events.find(e => e[0] === "bind")[1], input);
  reset({ conflict: true }); assert.equal((await route.POST(post())).status, 409);
});
test("download resolve versão jurídica e encaminha somente a versão GED fixada", async () => {
  reset(); const response = await route.GET(new Request(`${url}?legalTextId=legal&download=link`));
  assert.equal(response.status, 303); const location = new URL(response.headers.get("location")); assert.equal(location.pathname, "/api/assinatura-digital/ged/download"); assert.deepEqual(JSON.parse(location.searchParams.get("items")), [{ id: "doc", versionId: "pinned-v1" }]); assert(f.events.some(e => e[0] === "object"));
  reset({ download: false }); assert.equal((await route.GET(new Request(`${url}?legalTextId=legal&download=other`))).status, 404);
});
test("norma ausente não lista GED e listagem disponível permanece privada", async () => {
  reset({ missing: true }); assert.equal((await route.GET(new Request(`${url}?legalTextId=other&view=available`))).status, 404); assert.equal(f.events.some(e => e[0] === "list"), false);
  reset(); const response = await route.GET(new Request(`${url}?legalTextId=legal&view=available`)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
});
