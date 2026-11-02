import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";

// HTTP boundary: authorization/IO sentinels; real filters, dataset and renderers.
const fixture = { events: [], denied: false, failure: false, unavailable: false, auditFailure: false };
let route;
before(async () => {
  const stubs = {
    "@/db/client": 'export const db={};export const databaseConnection={};',
    "@/lib/platform/tenant-context": 'export class AccessError extends Error {status=403;} export async function getTenantContextForModuleOperation(module,operation){fixture.events.push(["auth",module,operation]);if(fixture.denied)throw new AccessError("Acesso negado.");return {user:{id:"actor",name:"Operador fixture"}};}',
    "@/db/repositories/platform/audit": 'export async function insertAuditEvent(db,event){fixture.events.push(["audit",event]);if(fixture.auditFailure)throw Error("PRIVATE_AUDIT");}',
    "@/lib/environment/recycling-report-service": 'import {RecyclingReportError} from "@/lib/environment/recycling-reports";export async function readRecyclingReport(connection,filters,page,all){fixture.events.push(["read",filters,page,all]);if(fixture.failure)throw Error("PRIVATE_DATABASE");if(fixture.unavailable)throw new RecyclingReportError("Indisponível.",503);return {instanceId:"authorized-instance",institution:null,data:{filters,page:1,total:21,revenue:"21.00",maximum:"1.00",rows:Array.from({length:21},(_,i)=>({id:String(i),code:"M"+i,name:"Material "+i,type:"Papel",unit:"kg",depot:"Central",depotCode:"D1",opening:"0.000",incoming:"2.000",outgoing:"1.000",balance:"1.000",revenue:"1.00",movements:"1"}))}};}',
  };
  const bundle = await build({ entryPoints: ["src/app/api/meio-ambiente/reciclagem/relatorios/route.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", logLevel: "silent", plugins: [{ name: "report-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "boundary" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", "fixture", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports, fixture);
  route = compiled.exports;
});
function reset(overrides = {}) { Object.assign(fixture, { events: [], denied: false, failure: false, unavailable: false, auditFailure: false }, overrides); }
function request(query = "") { return new Request(`https://municipal.fixture/api/meio-ambiente/reciclagem/relatorios?from=2026-01-01&to=2026-03-31&${query}`); }

test("issueReports is checked before filters/IO and denied responses are private", async () => {
  reset({ denied: true });
  const response = await route.GET(request("format=invalid"));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(fixture.events, [["auth", "MEIO_AMBIENTE", "issueReports"]]);
});
test("invalid filters and formats never query or audit", async () => {
  for (const query of ["format=pdf", "view=other", "materialCode=../invalid", "order=SQL", "from=2026-02-30"]) {
    reset(); const response = await route.GET(request(query));
    assert.equal(response.status, 400, query);
    assert.equal(fixture.events.length, 1);
  }
});
test("complete export ignores page and caller instance, audits and delivers all 21 rows", async () => {
  reset(); const response = await route.GET(request("page=2&instanceId=other&format=csv&depotCode=D1"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  const csv = await response.text(); assert.match(csv, /Material 0/); assert.match(csv, /Material 20/);
  const read = fixture.events[1]; assert.equal(read[2], undefined); assert.equal(read[3], true);
  assert.equal("instanceId" in read[1], false); assert.equal(read[1].depotCode, "D1");
  assert.equal(fixture.events[2][1].actorUsuarioId, "actor");
  assert.match(fixture.events[2][1].targetId, /^authorized-instance:/);
});
test("print and Excel reuse real renderers and correct private content types", async () => {
  for (const format of ["print", "xlsx"]) {
    reset(); const response = await route.GET(request(`format=${format}`));
    assert.equal(response.status, 200);
    if (format === "print") { assert.match(response.headers.get("content-disposition"), /^inline;/); assert.match(await response.text(), /Material 20/); }
    else { assert.match(response.headers.get("content-type"), /spreadsheetml/); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), "PK"); }
  }
});
test("unavailable storage and failed audit never produce a successful report or leak errors", async () => {
  for (const overrides of [{ unavailable: true }, { failure: true }, { auditFailure: true }]) {
    reset(overrides); const response = await route.GET(request());
    assert.equal(response.status, overrides.unavailable ? 503 : 500);
    assert.doesNotMatch(await response.text(), /PRIVATE_/);
    if (!overrides.auditFailure) assert.equal(fixture.events.some(event => event[0] === "audit"), false);
  }
});
