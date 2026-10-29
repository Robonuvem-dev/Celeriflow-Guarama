import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertArchivedInventory, assertBoundCall, assertDrizzleSource, assertHistoricalArtifact, assertOperationalRenderer, currentSources, historicalHealthBaseline, historicalVisualBaseline, migrationProvenance, operationalRendererChain, parseContractSource } from "./helpers/table-migration-contracts";
import { healthPagesJsxFingerprint } from "./helpers/health-pages-jsx-fingerprint";

test("provenance: original fixture digests, source commit and AST version remain independent trust anchors", () => {
  assert.equal(migrationProvenance.inventorySourceCommit, "b199957ce1712fdf1613b4d6909643c3cca4c2c1");
  const visual = migrationProvenance.historicalArtifacts["historical-visual-baselines.json"];
  assert.equal(visual.lfSha256, "6e2f385c7262463b04ae7807627b2bc89e18d5fed51c3e46ec627a45a7e71e75");
  assert.equal(visual.sourceCommit, "5cfa75dfe20a6d3fcc20dce33e818585cb8b9954");
  assert.equal(visual.typescriptVersion, "5.9.3");
  assert.equal(migrationProvenance.historicalArtifacts["health-pages-original-jsx.json"].lfSha256, "932c4c42b898a76568d19a5e63a009478c8d8526bdf0c9565ca2d9e6a9aee161");
  assert.equal(historicalVisualBaseline().sourceCommit, visual.sourceCommit);
  assert.equal(Object.keys(historicalHealthBaseline().files).length, 100);
});

test("provenance: CRLF is portable; edits to sourceCommit, AST hashes or AST version are rejected", () => {
  const original = readFileSync(new URL("./fixtures/historical-visual-baselines.json", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const expected = migrationProvenance.historicalArtifacts["historical-visual-baselines.json"].lfSha256;
  assertHistoricalArtifact(original.replaceAll("\n", "\r\n"), expected);
  for (const changed of [original.replace("5cfa75d", "0000000"), original.replace('"5.9.3"', '"0.0.0"'), original.replace(/"sha256": "[a-f0-9]{64}"/, '"sha256": "' + "0".repeat(64) + '"')]) {
    assert.notEqual(changed, original);
    assert.throws(() => assertHistoricalArtifact(changed, expected), /Historical artifact changed/);
  }
});

test("historical health AST normalizer preserves callbacks and attributes, ignoring only assertions/CRLF", () => {
  const plain = 'export const Row = () => <button onClick={() => save(id)} className="row">Salvar</button>;';
  const typed = plain.replace("save(id)", "save(id as string)").replaceAll(";", ";\r\n");
  assert.deepEqual(healthPagesJsxFingerprint("row.tsx", typed), healthPagesJsxFingerprint("row.tsx", plain));
  for (const changed of [plain.replace("save(id)", "undefined"), plain.replace('className="row"', 'className="hidden"')]) assert.notDeepEqual(healthPagesJsxFingerprint("row.tsx", changed), healthPagesJsxFingerprint("row.tsx", plain));
});

test("semantic AST: aliases work; unused guard imports, wrong modules and discarded access arguments fail", () => {
  const code = 'import { getTenantContextForModule as guard } from "@/lib/platform/tenant-context"; import { loadPageCaseList as read } from "@/db/repositories/works-pages/cases"; export async function Page() { const context = await guard("OBRAS"); return read(context.database ?? db, access, filters); }';
  const good = parseContractSource("inline.tsx", code);
  assertBoundCall(good, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"OBRAS"']);
  assertBoundCall(good, "@/db/repositories/works-pages/cases", "loadPageCaseList", ["context.database ?? db", "access", "filters"]);
  for (const changed of [code.replace('guard("OBRAS")', 'guard("SAUDE")'), code.replace('guard("OBRAS")', 'Promise.resolve({})')]) assert.throws(() => assertBoundCall(parseContractSource("inline.tsx", changed), "@/lib/platform/tenant-context", "getTenantContextForModule", ['"OBRAS"']), /missing/);
  for (const changed of [code.replace("context.database ?? db, access", "db, access"), code.replace("access, filters", "{}, filters")]) assert.throws(() => assertBoundCall(parseContractSource("inline.tsx", changed), "@/db/repositories/works-pages/cases", "loadPageCaseList", ["context.database ?? db", "access", "filters"]), /missing/);
});

test("current Drizzle gate rejects dynamic legacy imports, client DB access and inline page SQL", () => {
  for (const code of ['export const run = () => import("@prisma/client");', 'import { PrismaClient } from "@prisma/client";', '"use client"; import "@/db/client";', '"use client"; import { db } from "@/db/client";', 'export const Page = () => database.select();']) assert.throws(() => assertDrizzleSource(parseContractSource("inline.tsx", code), true));
  assertDrizzleSource(parseContractSource("inline.tsx", '"use client"; import type { Database } from "@/db/connection"; export const Row = () => <span>Drizzle is server-owned</span>;'));
});

test("coverage follows the rendered export, not unrelated functions in the same imported file", () => {
  const file = "src/components/app-ui/planejamento/PlanningPages.tsx";
  const chain = assertOperationalRenderer(file, "PlanningInstrumentsPage");
  assert.equal(chain.at(-1), "src/components/app-ui/operational/OperationalTable.tsx#OperationalTable");
  assert.equal(operationalRendererChain(file, "PlanningDashboard"), null);
  assert.throws(() => assertOperationalRenderer(file, "PlanningDashboard"), /no rendered chain/);
});

test("current inventory rejects deleting/replacing an original file even when total count is unchanged", () => {
  const files = currentSources("src/app/app-domain/rh");
  assertArchivedInventory("personnel", files);
  const removed = files.filter(file => file !== "src/app/app-domain/rh/servidores/page.tsx");
  assert.equal(removed.length, files.length - 1);
  assert.throws(() => assertArchivedInventory("personnel", [...removed, "src/app/app-domain/rh/unreviewed.tsx"]), /deleted\/replaced historical path/);
  assert.throws(() => assertArchivedInventory("personnel", files.filter(file => !file.endsWith("/RhTablePanel.tsx"))), /Missing reviewed addition/);
});
