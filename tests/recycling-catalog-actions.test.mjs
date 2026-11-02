import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";

// Boundary test: action/schema reais; identidade e IO substituídos por sentinelas.
// Persistência, locks e rollback reais têm cobertura em recycling-catalog-persistence.test.ts.
const fixture = { events: [], denied: false, failure: false, missing: false, saved: null };
let actions;
before(async () => {
  const stubs = {
    "next/cache": 'export function revalidatePath(path){fixture.events.push(["revalidate",path]);}',
    "@/db/client": 'export const db={};export const databaseConnection={};',
    "@/db/transaction": 'export async function withDatabaseTransaction(connection,work){fixture.events.push(["transaction"]);return work({fixture:true});}',
    "@/db/repositories/platform/instance-configuration": 'export async function findOperationalInstance(){fixture.events.push(["instance"]);return fixture.missing?null:{id:"municipality"};}',
    "@/db/repositories/environment/recycling-catalog": 'export async function saveRecyclingCatalogEntry(tx,input){fixture.events.push(["persist"]);if(fixture.failure)throw Error("DATABASE_PRIVATE_FIXTURE");fixture.saved=input;}',
    "@/lib/platform/tenant-context": 'export async function getTenantContextForModuleOperation(module,operation){fixture.events.push(["auth",module,operation]);if(fixture.denied)throw Error("AUTH_PRIVATE_FIXTURE");return {user:{id:"actor"}};}',
  };
  const bundle = await build({ entryPoints: ["src/app/app-domain/meio-ambiente/residuos/cadastros/actions.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", logLevel: "silent", plugins: [{ name: "catalog-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "boundary" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "fixture", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiledModule, compiledModule.exports, fixture);
  actions = compiledModule.exports;
});
function reset(overrides = {}) { Object.assign(fixture, { events: [], denied: false, failure: false, missing: false, saved: null }, overrides); }
function form(mode = "create") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ mode, kind: "depots", code: "D1", name: "Depósito", description: "Integral", address: "Rua municipal" })) data.set(key, value);
  return data;
}
test("action original conserva Promise<void> e adapter devolve sucesso estruturado", async () => {
  reset();
  assert.equal(await actions.saveRecyclingEntry(form()), undefined);
  assert.deepEqual(fixture.events[0], ["auth", "MEIO_AMBIENTE", "create"]);
  assert.equal(fixture.saved.entry.active, false);
  assert.equal(fixture.saved.entry.address, "Rua municipal");
  reset();
  assert.deepEqual(await actions.saveRecyclingEntryForClient(form("update")), { success: true });
  assert.deepEqual(fixture.events[0], ["auth", "MEIO_AMBIENTE", "update"]);
  assert.equal(fixture.saved.actorUsuarioId, "actor");
  assert(fixture.events.some(event => event[0] === "revalidate"));
});
test("sem permissão, nenhuma consulta ou gravação acontece e erro privado não vaza", async () => {
  reset({ denied: true });
  const result = await actions.saveRecyclingEntryForClient(form("update"));
  assert.equal(typeof result.error, "string");
  assert.doesNotMatch(result.error, /AUTH_PRIVATE_FIXTURE/);
  assert.deepEqual(fixture.events, [["auth", "MEIO_AMBIENTE", "update"]]);
  await assert.rejects(actions.saveRecyclingEntry(form()), /AUTH_PRIVATE_FIXTURE/);
});
test("schema inválido não alcança a transação e preserva o contrato client", async () => {
  reset(); const data = form(); data.set("code", "../inválido");
  const result = await actions.saveRecyclingEntryForClient(data);
  assert.equal(typeof result.error, "string");
  assert.deepEqual(fixture.events, [["auth", "MEIO_AMBIENTE", "create"]]);
});
test("falha de persistência ou instância ausente não retorna falso sucesso nem revalida", async () => {
  for (const overrides of [{ failure: true }, { missing: true }]) {
    reset(overrides);
    const result = await actions.saveRecyclingEntryForClient(form());
    assert.equal(typeof result.error, "string"); assert.doesNotMatch(result.error, /DATABASE_PRIVATE_FIXTURE/);
    assert.equal(fixture.events.some(event => event[0] === "revalidate"), false);
  }
});
