import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";

const fixture = { events: [], denied: false, conflict: false, saved: null };
let actions;
before(async () => {
  const stubs = {
    "next/cache": 'export function revalidatePath(path){fixture.events.push(["revalidate",path]);}',
    "@/db/client": 'export const db={};export const databaseConnection={};',
    "@/db/transaction": 'export async function withDatabaseTransaction(connection,work){fixture.events.push(["transaction"]);return work({});}',
    "@/db/repositories/registry/master-data-operations": 'import {MasterDataValidationError} from "@/lib/cadastros/master-data-service";export async function saveLegalText(...args){fixture.events.push(["save"]);fixture.saved=args;if(fixture.conflict)throw new MasterDataValidationError("Este texto foi alterado por outra pessoa.");return "legal-id";}',
    "@/db/repositories/registry/master-data-guards": 'export function assertCanInactivate(){}',
    "@/db/repositories/registry/consistency": 'export function runMasterDataConsistency(){}',
    "@/db/repositories/platform/audit": 'export async function insertAuditEvent(tx,event){fixture.events.push(["audit",event]);}',
    "@/lib/platform/tenant-context": 'export class AccessError extends Error {status=403;}export async function getTenantContextForModuleOperation(module,operation){fixture.events.push(["auth",module,operation]);if(fixture.denied)throw new AccessError("PRIVATE_AUTH");return {user:{id:"actor"}};}',
  };
  const bundle = await build({ entryPoints: ["src/app/app-domain/cadastros/master-data-actions.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", logLevel: "silent", plugins: [{ name: "legal-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "boundary" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", "fixture", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports, fixture);
  actions = compiled.exports;
});
function reset(overrides = {}) { Object.assign(fixture, { events: [], denied: false, conflict: false, saved: null }, overrides); }
const values = { type: "Lei", number: "1", summary: "Ementa", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura", content: "Conteúdo integral", publicationDate: "2026-01-01" };
test("consulta sem permissão não alcança transação nem persistência", async () => {
  for (const id of [null, "legal-id"]) {
    reset({ denied: true }); const result = await actions.mutateMasterDataRecord("legalTexts", id, values);
    assert.equal(typeof result.error, "string"); assert.doesNotMatch(result.error, /PRIVATE_AUTH/);
    assert.deepEqual(fixture.events, [["auth", "CADASTROS", id ? "update" : "create"]]);
  }
});
test("criação mantém contrato estruturado e edição transmite versão esperada sem alterar conteúdo", async () => {
  reset(); assert.deepEqual(await actions.mutateMasterDataRecord("legalTexts", null, values), {});
  assert.equal(fixture.saved[4], undefined);
  reset(); assert.deepEqual(await actions.mutateMasterDataRecord("legalTexts", "legal-id", { ...values, expectedVersion: "2" }), {});
  assert.equal(fixture.saved[1], "legal-id"); assert.equal(fixture.saved[3], values.content); assert.equal(fixture.saved[4], 2);
  assert.deepEqual(fixture.events[0], ["auth", "CADASTROS", "update"]);
  assert.equal(fixture.events.find(event => event[0] === "audit")[1].actorUsuarioId, "actor");
});
test("edição sem token ou com token inválido não grava nem revalida", async () => {
  for (const token of [undefined, "", "-1", "1.5", "9007199254740992", true, []]) {
    reset(); const result = await actions.mutateMasterDataRecord("legalTexts", "legal-id", { ...values, expectedVersion: token });
    assert.equal(typeof result.error, "string"); assert.equal(fixture.events.some(event => ["save", "audit", "revalidate"].includes(event[0])), false);
  }
});
test("conflito conserva contrato client e impede auditoria/revalidação de falso sucesso", async () => {
  reset({ conflict: true }); const result = await actions.mutateMasterDataRecord("legalTexts", "legal-id", { ...values, expectedVersion: "1" });
  assert.match(result.error, /outra pessoa/);
  assert.equal(fixture.events.some(event => ["audit", "revalidate"].includes(event[0])), false);
});
