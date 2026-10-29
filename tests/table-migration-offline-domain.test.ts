import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Group A discovers tests/ and src/lib/, but not src/app/ or src/components/.
// Keep the owner suites persisted in their domains and make CI execute them.
const suites = [
  "src/app/app-domain/educacao/professor/entry-drafts.test.ts",
  "src/app/app-domain/financeiro/draft-rows.test.ts",
  "src/app/app-domain/patrimonio/_components/operational-workflows.test.mjs",
  "src/app/app-domain/saude/atendimentos/[id]/complementos/administration-supplies.test.ts",
  "src/app/app-domain/social/requisicoes/benefit-item-drafts.test.ts",
  "src/app/app-domain/sst/_components/draft-payload.test.ts",
  "src/app/app-domain/tributacao/tax-draft-state.test.ts",
  "src/app/app-domain/tributacao/tax-form-submit.test.ts",
  "src/app/portal/public-columns.test.ts",
  "src/app/portal/tributario/itbi/novo/party-drafts.test.ts",
  "src/components/app-ui/planejamento/planning-drafts.test.ts",
  "src/components/app-ui/planejamento/operational-columns.test.ts",
];

test("migration: all offline domain/table/payload suites run in CI", { timeout: 90_000 }, t => {
  // Group A uses --conditions=react-server. These client harnesses need the
  // normal React/ReactDOM exports, including renderToStaticMarkup. A separate
  // process deliberately receives explicit flags, without inheriting execArgv.
  const env = { ...process.env };
  // Node's parent test-runner context otherwise suppresses the nested runner.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--import", "tsx", "tests/helpers/run-table-domain-suites.mjs", JSON.stringify(suites)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env,
    encoding: "utf8",
    timeout: 80_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  t.diagnostic(result.stdout);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^# tests [1-9]\d*$/m, "The nested runner must actually execute tests.");
  assert.match(result.stdout, /serializes the complete clinical supply set/, "Next.js [id] paths must not be treated as test globs.");
});
