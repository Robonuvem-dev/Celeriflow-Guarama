import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";
import { PgDialect } from "drizzle-orm/pg-core";

const fixture = { deny: false, reads: 0, condition: null, record: null };
let GET;
before(async () => {
  const stubs = {
    "@/db/client": 'export const db={select(){fixture.reads++;const q={from(){return q},innerJoin(){return q},where(condition){fixture.condition=condition;return q},orderBy(){return q},async limit(){return fixture.record?[fixture.record]:[]}};return q}};',
    "@/lib/platform/tenant-context": 'export class AccessError extends Error {status=403;}export async function getTenantContextForModule(module){if(module!=="CADASTROS"||fixture.deny)throw new AccessError("Acesso negado.");return {user:{id:"actor"}};}',
  };
  const result = await build({ entryPoints: ["src/app/api/cadastros/textos-juridicos/imprimir/route.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", tsconfig: "tsconfig.json", plugins: [{ name: "print-boundary", setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const compiled = { exports: {} }; new Function("require", "module", "exports", "fixture", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports, fixture); GET = compiled.exports.GET;
});
const req = query => new Request(`https://municipal.fixture/api/cadastros/textos-juridicos/imprimir?${query}`);
test("impressão exige acesso ao cadastro antes de consultar", async () => {
  fixture.deny = true; fixture.reads = 0;
  assert.equal((await GET(req("legalTextId=id&version=1"))).status, 403);
  assert.equal(fixture.reads, 0); fixture.deny = false;
});
test("versão explícita é parametrizada; HTML privado preserva texto e nega conteúdo ativo", async () => {
  fixture.record = { type: "Lei", number: "2", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura", summary: null, content: "Art. 1º\n<script>alert(1)</script>", versionNumber: 2, publicationDate: null };
  const response = await GET(req("legalTextId=law-1&version=2"));
  assert.equal(response.status, 200); assert.deepEqual(new PgDialect().sqlToQuery(fixture.condition).params, ["law-1", 2]);
  assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  const content = await response.text(); assert.match(content, /Versão jurídica 2/); assert.match(content, /Art\. 1º\n&lt;script&gt;/); assert.doesNotMatch(content, /<script>/);
});
test("versão inexistente não cai em outra versão; entrada inválida não consulta", async () => {
  fixture.record = null;
  assert.equal((await GET(req("legalTextId=law-1&version=30"))).status, 404);
  const reads = fixture.reads; assert.equal((await GET(req("legalTextId=law-1&version=-1"))).status, 400); assert.equal(fixture.reads, reads);
});
