import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { baselineReceiptProvenance, validateAuditedBaseline } from "../scripts/database-migrate-baseline.mjs";
import { loadMigrationSet, sha256, stableJson } from "../scripts/database-migrate-files.mjs";
import { MigrationBlockedError, runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { databaseMigrateMain } from "../scripts/database-migrate.mjs";

function repin(set) {
  set.auditedBaseline.digest = sha256(stableJson(set.auditedBaseline.manifest));
  set.policy.auditedBaseline.manifestDigest = set.auditedBaseline.digest;
}

test("versioned baseline pins owner authorization, original reviewed catalog and the one unresolved tuple, without claiming byte proof", () => {
  const set = loadMigrationSet();
  const authorization = validateAuditedBaseline(set, { requestedDigest: set.policy.auditedBaseline.manifestDigest });
  assert.equal(set.historical.length, 156);
  assert.equal(authorization.manifest.unresolvedHistoricalDifferences.length, 1);
  assert.equal(set.unresolved[0].classification, "UNRESOLVED_HISTORICAL_DIFFERENCE");
  const clinical = set.historical.find(row => row.name === set.unresolved[0].name);
  assert.equal(clinical.historicalProof, null);
  const proof = baselineReceiptProvenance(clinical, authorization);
  assert.equal(proof.byteProof, null);
  assert.equal(proof.auditedBaseline.unresolvedDifference.installedChecksum, "56942636553fc17917a3e70970ac21b9d9bad907c4289960170333f6fd3f5a80");
  assert.equal(proof.auditedBaseline.unresolvedDifference.lfChecksum, "e4590cc6c6426625afe58396ebfd7a5f07f75ed2dfdfb32eb319586a82c1ea2a");
  assert.equal(sha256(readFileSync(clinical.source)), clinical.checksum);
  assert.equal(baselineReceiptProvenance(set.historical[0], authorization).auditedBaseline.unresolvedDifference, null);
});

test("manifest edits, exact tuple changes, extra unresolved history, recovery drift and catalog substitution are refused", () => {
  const mutations = [
    set => { set.auditedBaseline.manifest.authorization.scope += " edited"; },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].installedChecksum = "0".repeat(64); repin(set); },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].source += ".other"; repin(set); },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].lfChecksum = "0".repeat(64); repin(set); },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].recordedLocalChecksum = "0".repeat(64); repin(set); },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].localByteVariants.push("0".repeat(64)); repin(set); },
    set => { set.auditedBaseline.manifest.unresolvedHistoricalDifferences[0].classification = "PROVEN_MIXED_LINE_ENDINGS"; repin(set); },
    set => { set.historical[0].classification = "UNRESOLVED_HISTORICAL_DIFFERENCE"; set.unresolved.unshift({ name: set.historical[0].name }); },
    set => { set.recovery.replay.catalogDifferences = 1; },
    set => { set.recoverySha256 = "0".repeat(64); },
    set => { set.historySha256 = "0".repeat(64); },
    set => { set.baselineDigest = "0".repeat(64); },
    set => { set.auditedBaseline.manifest.authorization.executeHistoricalSql = true; repin(set); },
  ];
  for (const mutate of mutations) {
    const set = loadMigrationSet();
    mutate(set);
    assert.throws(() => validateAuditedBaseline(set), /Audited baseline:/);
  }
  const set = loadMigrationSet();
  assert.throws(() => validateAuditedBaseline(set, { requestedDigest: "0".repeat(64) }), /explicit manifest digest/);
  assert.throws(() => validateAuditedBaseline(set, { catalog: { fileSha256: "0".repeat(64), digest: set.auditedBaseline.manifest.reviewedCatalog.digest } }), /original reviewed reference/);
  assert.throws(() => validateAuditedBaseline(set, { catalog: { fileSha256: set.auditedBaseline.manifest.reviewedCatalog.fileSha256, digest: "0".repeat(64) } }), /original reviewed reference/);
});

test("baseline uses the same lock before any authority write, rolls back lock contention, and reports unknown rollback outcome", async () => {
  for (const lostRollback of [false, true]) {
    const commands = [];
    const connection = {
      exec: async sql => { commands.push(sql); if (sql === "ROLLBACK" && lostRollback) throw new Error("transport lost"); },
      query: async sql => {
        commands.push(sql);
        if (sql.includes("current_setting('timezone')")) return { rows: [{ timezone: "UTC" }] };
        if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: false }] };
        if (sql.includes("set_config")) return { rows: [{}] };
        throw new Error("Unexpected query before lock");
      },
    };
    await assert.rejects(runDatabaseMigrations(connection, loadMigrationSet(), { command: "baseline" }), error => {
      assert.ok(error instanceof MigrationBlockedError);
      assert.equal(lostRollback ? error.report.result : error.report.code, lostRollback ? "OUTCOME_UNKNOWN" : "MIGRATION_LOCK_BUSY");
      return true;
    });
    assert.equal(commands[0], "BEGIN ISOLATION LEVEL READ COMMITTED");
    assert.equal(commands.at(-1), "ROLLBACK");
    assert.ok(commands.every(sql => !/CREATE|INSERT|UPDATE|DELETE/.test(sql)));
  }
});

test("CLI baseline requires catalog+file hash+explicit manifest digest and never initializes through deploy flags", async () => {
  for (const args of [
    ["baseline"], ["baseline", "--catalog=x", `--catalog-sha256=${"0".repeat(64)}`],
    ["deploy", `--baseline-manifest-digest=${"0".repeat(64)}`],
    ["adopt", `--baseline-manifest-digest=${"0".repeat(64)}`],
    ["plan", `--baseline-manifest-digest=${"0".repeat(64)}`],
  ]) await assert.rejects(databaseMigrateMain(args, {}), /requires|only for/);
});

test("offline file verification validates the authorized baseline without asserting adoption or database initialization", async () => {
  const messages = [];
  const log = console.log;
  try {
    console.log = message => { messages.push(JSON.parse(message)); };
    assert.equal(await databaseMigrateMain(["verify-files"], {}), 0);
  } finally { console.log = log; }
  assert.equal(messages.length, 1);
  assert.equal(messages[0].result, "FILES_INTACT_BASELINE_AUTHORIZED");
  assert.equal(messages[0].strictAdoption, "BLOCKED");
  assert.equal(messages[0].databaseAuthority, "NOT_CHECKED");
  assert.equal(messages[0].historical, 156);
  assert.equal(messages[0].historicalDifferences[0].classification, "UNRESOLVED_HISTORICAL_DIFFERENCE");
  assert.equal(messages[0].baselineManifestDigest, loadMigrationSet().policy.auditedBaseline.manifestDigest);
});
