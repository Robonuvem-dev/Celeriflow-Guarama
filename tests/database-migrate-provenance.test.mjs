import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadMigrationSet, repositoryRoot, sha256 } from "../scripts/database-migrate-files.mjs";
import { validateHistoricalProvenance } from "../scripts/database-migrate-provenance.mjs";
import { unresolvedBaselineTuple } from "../scripts/database-migrate-baseline.mjs";

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

test("a mixed checkout matching the installed hash cannot reclassify unresolved history or change its authorized tuple", () => {
  const parent = join(repositoryRoot, ".agent", "drizzle");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "mixed-checkout-test-"));
  const name = "20260101000000_mixed_checkout";
  const source = `history/${name}/migration.sql`;
  const lf = "-- preserved source\nCREATE TABLE fixture(id text);\n-- preserved end\n";
  const crlf = lf.replaceAll("\n", "\r\n");
  const installed = "-- preserved source\r\nCREATE TABLE fixture(id text);\n-- preserved end\r\n";
  const otherMixed = "-- preserved source\nCREATE TABLE fixture(id text);\r\n-- preserved end\n";
  const record = { name, installedChecksum: sha256(installed), localChecksum: sha256(crlf), lfChecksum: sha256(lf), classification: "UNRESOLVED_HISTORICAL_DIFFERENCE" };
  const expectedTuple = { name, source, installedChecksum: record.installedChecksum, recordedLocalChecksum: record.localChecksum, lfChecksum: record.lfChecksum, localByteVariants: [sha256(lf), sha256(crlf)].sort(), classification: record.classification };
  const writeHistory = () => writeFileSync(join(root, "history.json"), JSON.stringify({ migrations: 1, records: [record] }));
  try {
    mkdirSync(join(root, "db/migrations"), { recursive: true });
    mkdirSync(join(root, "history", name), { recursive: true });
    writeFileSync(join(root, "db/migration-authority.json"), JSON.stringify({ formatVersion: 1, authority: "celeriflow-explicit-sql-v1", historicalDirectory: "history", historicalCount: 1, historyReport: "history.json", recoveryReport: "recovery.json", futureDirectory: "db/migrations", historicalTransactionEnvelopes: [] }));
    writeFileSync(join(root, "recovery.json"), JSON.stringify({ result: "PASS", replay: { migrationsApplied: 1, catalogDifferences: 0 } }));
    writeHistory();
    let baselineDigest;
    for (const sql of [lf, crlf, installed, otherMixed]) {
      writeFileSync(join(root, source), sql);
      const set = loadMigrationSet(root), migration = set.historical[0];
      baselineDigest ??= set.baselineDigest;
      assert.equal(set.baselineDigest, baselineDigest, "checkout bytes cannot change the historical baseline identity");
      assert.deepEqual(unresolvedBaselineTuple(migration), expectedTuple, "the authorized tuple excludes incidental mixed checkout hashes");
      assert.equal(migration.classification, "UNRESOLVED_HISTORICAL_DIFFERENCE");
      assert.equal(migration.historicalProof, null, "raw hash equality is not an archived byte proof");
      assert.deepEqual(set.provenHistoricalVariants, []);
      assert.deepEqual(set.unresolved.map(row => row.name), [name]);
      assert.equal(migration.checksum, sha256(sql));
      assert.ok(migration.byteVariants.includes(sha256(sql)), "actual execution bytes remain available for receipt validation");
      assert.equal(readFileSync(join(root, source), "utf8"), sql, "the loader never rewrites SQL");
    }
    writeFileSync(join(root, source), installed);
    for (const classification of ["EXACT", "LINE_ENDINGS_ONLY", "PROVEN_MIXED_LINE_ENDINGS"]) {
      record.classification = classification;
      writeHistory();
      assert.throws(() => loadMigrationSet(root), /inconsistent provenance classification/, "unarchived mixed bytes cannot authorize a different classification");
    }
    record.classification = "UNRESOLVED_HISTORICAL_DIFFERENCE";
    writeHistory();
    writeFileSync(join(root, source), installed.replace("id text", "id integer"));
    assert.throws(() => loadMigrationSet(root), /historical SQL content changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
