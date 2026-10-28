import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadMigrationSet, repositoryRoot, sha256 } from "../scripts/database-migrate-files.mjs";
import { validateHistoricalProvenance } from "../scripts/database-migrate-provenance.mjs";

// Pure offline byte tests: no PGlite, environment loading or network driver.
const name = "20261015220000_health_aih_apac_workflows";
const source = `prisma/migrations-ibema/${name}/migration.sql`;
const artifact = `db/historical-provenance/${name}.json`;
const bytes = readFileSync(join(repositoryRoot, source));
const archive = JSON.parse(readFileSync(join(repositoryRoot, artifact), "utf8"));
const expected = { name, source, installedChecksum: "5fdfa81973db5e6bab704e102550a52eac2dbd9773151eae576923e509194cbd", lfChecksum: "d5d9b045afaff9d3c0b38eefb14a347d375b2742c9e131f8e61c9133472f2a55" };

test("the archived 58-line variant reproduces the installed SHA-256 and preserves every SQL line byte", () => {
  const proof = validateHistoricalProvenance(bytes, archive, expected);
  assert.equal(sha256(proof.reconstructedBytes), expected.installedChecksum);
  assert.equal(proof.reconstructedBytes.length, 5110);
  assert.deepEqual(proof.lineTerminators.flatMap((ending, index) => ending === "LF" ? [index + 1] : []), [46, 52, 53, 54, 55, 56, 57, 58]);
  assert.deepEqual(Buffer.from(proof.reconstructedBytes.toString("utf8").replaceAll("\r\n", "\n")), Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n")));
  assert.deepEqual(readFileSync(join(repositoryRoot, source)), bytes, "validation never restores/rewrites the historical source");
});

test("a claimed approval, changed line ending, SQL byte or installed checksum cannot waive the exact proof", () => {
  const changedEnding = structuredClone(archive);
  changedEnding.lineTerminators[0] = "LF";
  changedEnding.proof.normalizedContentIdentical = true;
  assert.throws(() => validateHistoricalProvenance(bytes, changedEnding, expected), /reconstructed SHA-256/);
  const changedSql = structuredClone(archive);
  changedSql.normalizedSqlBase64 = Buffer.from(Buffer.from(archive.normalizedSqlBase64, "base64").toString("utf8").replace("CREATE TABLE", "CREATE  TABLE")).toString("base64");
  assert.throws(() => validateHistoricalProvenance(bytes, changedSql, expected), /normalized SHA-256/);
  assert.throws(() => validateHistoricalProvenance(Buffer.from(bytes.toString("utf8") + "-- additional SQL\r\n"), archive, expected), /SQL line bytes differ/);
  assert.throws(() => validateHistoricalProvenance(bytes, { ...archive, installedChecksum: "0".repeat(64) }, expected), /identity\/checksum differs/);
  assert.throws(() => validateHistoricalProvenance(bytes, { ...archive, bom: true }, expected), /without a BOM/);
  assert.throws(() => validateHistoricalProvenance(bytes, { ...archive, lineTerminators: archive.lineTerminators.slice(1) }, expected), /count differs/);
});

test("the loader requires the actual archive, preserves both hashes and is stable across checkout/report line-ending normalization", () => {
  const parent = join(repositoryRoot, ".agent", "drizzle");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "historical-proof-test-"));
  try {
    const policy = { formatVersion: 1, authority: "celeriflow-explicit-sql-v1", historicalDirectory: "prisma/migrations-ibema", historicalCount: 1, historyReport: "history.json", recoveryReport: "recovery.json", futureDirectory: "db/migrations", historicalTransactionEnvelopes: [] };
    const originalHistory = JSON.parse(readFileSync(join(repositoryRoot, "docs/drizzle-inventory/migration-history.json"), "utf8"));
    const record = structuredClone(originalHistory.records.find(row => row.name === name));
    record.classification = "UNRESOLVED_HISTORICAL_DIFFERENCE";
    mkdirSync(join(root, "db/migrations"), { recursive: true });
    mkdirSync(join(root, "db/historical-provenance"), { recursive: true });
    mkdirSync(join(root, "prisma/migrations-ibema", name), { recursive: true });
    writeFileSync(join(root, "db/migration-authority.json"), JSON.stringify(policy));
    writeFileSync(join(root, "recovery.json"), JSON.stringify({ result: "PASS", replay: { migrationsApplied: 1, catalogDifferences: 0 } }));
    writeFileSync(join(root, "history.json"), JSON.stringify({ migrations: 1, records: [record] }));
    writeFileSync(join(root, source), bytes);
    assert.equal(loadMigrationSet(root).unresolved.length, 1, "a known name with an unproven hash stays blocked");
    writeFileSync(join(root, artifact), JSON.stringify(archive));
    const proved = loadMigrationSet(root);
    assert.deepEqual(proved.unresolved, []);
    assert.equal(proved.historical[0].checksum, sha256(bytes));
    assert.equal(proved.historical[0].historicalProof.installedChecksum, expected.installedChecksum);
    assert.equal(proved.provenHistoricalVariants[0].classification, "PROVEN_MIXED_LINE_ENDINGS");
    writeFileSync(join(root, source), bytes.toString("utf8").replaceAll("\r\n", "\n"));
    assert.equal(loadMigrationSet(root).baselineDigest, proved.baselineDigest);
    assert.deepEqual(loadMigrationSet(root).provenHistoricalVariants, proved.provenHistoricalVariants);
    record.classification = "PROVEN_MIXED_LINE_ENDINGS";
    writeFileSync(join(root, "history.json"), JSON.stringify({ migrations: 1, records: [record] }));
    assert.equal(loadMigrationSet(root).baselineDigest, proved.baselineDigest, "parent can classify the proved variant without changing its identity");
    rmSync(join(root, artifact));
    assert.throws(() => loadMigrationSet(root), /inconsistent provenance classification/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
