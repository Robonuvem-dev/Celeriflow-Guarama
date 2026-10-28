import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { captureMigrationCatalog, loadBaselineCatalog } from "../scripts/database-migrate-catalog.mjs";
import { loadMigrationSet, repositoryRoot, sha256, stableJson } from "../scripts/database-migrate-files.mjs";
import { MigrationBlockedError, runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { prepareMigrationSql } from "../scripts/database-migrate-sql.mjs";

const baseName = "20260101000000_fixture";
const baseSql = `CREATE TABLE public.migration_fixture (id text PRIMARY KEY, value integer NOT NULL);
  CREATE FUNCTION public.migration_fixture_guard() RETURNS trigger LANGUAGE plpgsql AS $guard$
  BEGIN IF NEW.value < 0 THEN RAISE EXCEPTION 'negative fixture'; END IF; RETURN NEW; END $guard$;
  CREATE TRIGGER migration_fixture_guard BEFORE UPDATE ON public.migration_fixture FOR EACH ROW EXECUTE FUNCTION public.migration_fixture_guard();`;

function migration(name, sql, historical = false) {
  const checksum = sha256(sql), lfChecksum = sha256(sql.replaceAll("\r\n", "\n"));
  return {
    name, historical, source: `${historical ? "prisma/migrations-ibema" : "db/migrations"}/${name}/migration.sql`,
    checksum, lfChecksum, byteVariants: [...new Set([checksum, lfChecksum, sha256(sql.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"))])],
    provenance: historical ? { installedChecksum: checksum, classification: "EXACT" } : null,
    ...prepareMigrationSql(sql, { name }),
  };
}
function fixtureSet(future = []) {
  const historical = [migration(baseName, baseSql, true)];
  return {
    policy: { authority: "celeriflow-explicit-sql-v1", recoveryReport: "fixture-recovery" },
    historical, future, migrations: [...historical, ...future], unresolved: [],
    historySha256: sha256("fixture-history"),
    baselineDigest: sha256(stableJson(historical.map(({ name, lfChecksum, provenance }) => ({ name, lfChecksum, ...provenance })))),
  };
}
const pgConnection = pg => ({ query: (sql, params) => pg.query(sql, params), exec: sql => pg.exec(sql) });
const rows = async (pg, sql, params) => (await pg.query(sql, params)).rows;
const authorityExists = async pg => (await rows(pg, "SELECT to_regclass('public._celeriflow_sql_state') IS NOT NULL AS present"))[0].present;
const receiptCount = async pg => Number((await rows(pg, "SELECT count(*) AS count FROM public._celeriflow_sql_migrations"))[0].count);
const legacyText = async pg => (await rows(pg, "SELECT row_to_json(m)::text AS document FROM public._prisma_migrations m ORDER BY id")).map(row => row.document);
async function installLegacy(pg, set) {
  await pg.exec(baseSql);
  await pg.query("INSERT INTO public.migration_fixture VALUES ($1,$2)", ["kept", 7]);
  await pg.exec(`CREATE TABLE public._prisma_migrations (
    id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL,
    finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text,
    rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(),
    applied_steps_count integer NOT NULL DEFAULT 0
  )`);
  await pg.query(`INSERT INTO public._prisma_migrations (id,checksum,migration_name,started_at,finished_at,logs,applied_steps_count)
    VALUES ($1,$2,$3,'2026-01-01T01:02:03.123456Z','2026-01-01T01:02:04.654321Z',$4,1)`, ["fixture-original-id", set.historical[0].provenance.installedChecksum, baseName, "original log ' with precision"]);
  return { catalog: await captureMigrationCatalog(pgConnection(pg)), fileSha256: sha256("reviewed fixture catalog") };
}
function assertBlocked(error, code) {
  assert.ok(error instanceof MigrationBlockedError);
  if (code) assert.ok(error.report.issues?.some(issue => issue.code === code), JSON.stringify(error.report));
  return true;
}

test("reviewed envelopes cannot commit early; function bodies, strings and nested comments stay intact", () => {
  const body = `\n/* outer /* COMMIT; */ comment */ CREATE FUNCTION x() RETURNS void LANGUAGE plpgsql AS $tag$ BEGIN PERFORM ';COMMIT;'; END $tag$;
    SELECT E'escaped\\\';COMMIT;', 'it''s;safe', "semi;colon";\n`;
  const sql = `-- BEGIN in a comment\nBEGIN;${body}COMMIT; -- trailing comment`;
  const prepared = prepareMigrationSql(sql, { name: "reviewed", allowHistoricalEnvelope: true });
  assert.equal(prepared.executionSql, `${body} -- trailing comment`);
  assert.equal(prepared.statementCount, 2);
  assert.throws(() => prepareMigrationSql(sql, { name: "new" }), /transaction\/session control/);
  for (const unsafe of ["COMMIT", "ROLLBACK", "END", "ABORT", "SAVEPOINT x", "START TRANSACTION", "CREATE INDEX CONCURRENTLY i ON t(id)", "RESET ALL", "SELECT set_config('search_path','evil',false)", "VACUUM", "CALL commits_inside()", "PREPARE TRANSACTION 'escape'"]) {
    assert.throws(() => prepareMigrationSql(`CREATE TABLE x(id int); ${unsafe};`, { name: "unsafe" }));
  }
  assert.throws(() => prepareMigrationSql("BEGIN; SELECT 1; COMMIT; SELECT 2;", { name: "bad-envelope", allowHistoricalEnvelope: true }), /envelope changed/);
});

test("file provenance pins 156 exact sources, separates proved endings from unresolved history and verifies catalog bytes", () => {
  const set = loadMigrationSet();
  assert.equal(set.historical.length, 156);
  assert.deepEqual(set.unresolved.map(row => row.name), ["20261011010000_add_sst_clinical_services"]);
  assert.deepEqual(set.provenHistoricalVariants.map(row => row.name), ["20261015220000_health_aih_apac_workflows"]);
  assert.equal(set.historical.filter(row => row.historicalEnvelope).length, 4);
  const parent = join(repositoryRoot, ".agent", "drizzle");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "migration-file-test-"));
  try {
    const policy = { formatVersion: 1, authority: "celeriflow-explicit-sql-v1", historicalDirectory: "history", historicalCount: 1, historyReport: "history.json", recoveryReport: "recovery.json", futureDirectory: "future", historicalTransactionEnvelopes: [] };
    mkdirSync(join(directory, "db"));
    mkdirSync(join(directory, "history", baseName), { recursive: true });
    mkdirSync(join(directory, "future"));
    writeFileSync(join(directory, "db/migration-authority.json"), JSON.stringify(policy));
    writeFileSync(join(directory, "recovery.json"), JSON.stringify({ result: "PASS", replay: { migrationsApplied: 1, catalogDifferences: 0 } }));
    const sql = "-- source\r\nCREATE TABLE fixture(id text);\r\n";
    const file = join(directory, "history", baseName, "migration.sql");
    const record = { name: baseName, installedChecksum: sha256(sql), localChecksum: sha256(sql), lfChecksum: sha256(sql.replaceAll("\r\n", "\n")), classification: "EXACT" };
    writeFileSync(join(directory, "history.json"), JSON.stringify({ migrations: 1, records: [record] }));
    writeFileSync(file, sql);
    const first = loadMigrationSet(directory);
    writeFileSync(file, sql.replaceAll("\r\n", "\n"));
    assert.equal(loadMigrationSet(directory).baselineDigest, first.baselineDigest, "checkout line endings do not rewrite provenance");
    writeFileSync(file, sql + "SELECT 1;");
    assert.throws(() => loadMigrationSet(directory), /historical SQL content changed/);
    writeFileSync(file, sql);
    record.classification = "UNRESOLVED_HISTORICAL_DIFFERENCE";
    writeFileSync(join(directory, "history.json"), JSON.stringify({ migrations: 1, records: [record] }));
    assert.throws(() => loadMigrationSet(directory), /inconsistent provenance classification/);
    const catalogFile = join(directory, "catalog.json");
    writeFileSync(catalogFile, "{}");
    assert.throws(() => loadBaselineCatalog(catalogFile, "0".repeat(64)), /SHA-256 mismatch/);
    assert.equal(sha256(readFileSync(file)), record.localChecksum, "source bytes were never repaired");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("adoption leaves data, trigger and every installed ledger field untouched; deploy is exactly once", async () => {
  const pg = new PGlite();
  const future = migration("20270101000000_new_sql", "ALTER TABLE public.migration_fixture ADD COLUMN note text; INSERT INTO public.migration_fixture (id,value,note) VALUES ('new',9,'once');");
  const set = fixtureSet([future]), connection = pgConnection(pg);
  try {
    const baselineCatalog = await installLegacy(pg, set);
    const before = await legacyText(pg);
    const plan = await runDatabaseMigrations(connection, set, { command: "plan", baselineCatalog });
    assert.equal(plan.result, "READY_TO_ADOPT");
    assert.equal(await authorityExists(pg), false, "planning does not create receipts");
    const adopted = await runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog });
    assert.equal(adopted.adopted, 1);
    assert.deepEqual(adopted.applied, [], "adoption must never execute historical SQL");
    assert.deepEqual(await legacyText(pg), before);
    assert.deepEqual(await rows(pg, "SELECT * FROM public.migration_fixture"), [{ id: "kept", value: 7 }]);
    const receipt = (await rows(pg, "SELECT legacy_row FROM public._celeriflow_sql_migrations"))[0].legacy_row;
    assert.deepEqual(receipt, JSON.parse(before[0]), "original microsecond timestamps and logs copied exactly");
    await assert.rejects(pg.query("UPDATE public.migration_fixture SET value=-1 WHERE id='kept'"), /negative fixture/);
    assert.deepEqual((await runDatabaseMigrations(connection, set, { command: "deploy" })).applied, [future.name]);
    assert.deepEqual((await runDatabaseMigrations(connection, set, { command: "deploy" })).applied, []);
    assert.equal(await receiptCount(pg), 2);
    assert.deepEqual(await rows(pg, "SELECT id,value,note FROM public.migration_fixture ORDER BY id"), [{ id: "kept", value: 7, note: null }, { id: "new", value: 9, note: "once" }]);
    assert.deepEqual(await legacyText(pg), before, "deploy cannot append to or repair the installed ledger");
    await pg.query("UPDATE public._prisma_migrations SET logs='changed externally'");
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "deploy" }), error => assertBlocked(error));
  } finally { await pg.close(); }
});

test("same names, unknown rows, duplicate/failed attempts and unproven checksums cannot become adopted receipts", async () => {
  const pg = new PGlite(), set = fixtureSet(), connection = pgConnection(pg);
  try {
    const baselineCatalog = await installLegacy(pg, set);
    const scenarios = [
      ["UPDATE public._prisma_migrations SET checksum=repeat('0',64)", "INSTALLED_CHECKSUM_CHANGED"],
      ["UPDATE public._prisma_migrations SET finished_at=NULL", "INCOMPLETE_LEGACY_MIGRATION"],
      ["UPDATE public._prisma_migrations SET rolled_back_at=now()", "INCOMPLETE_LEGACY_MIGRATION"],
      ["UPDATE public._prisma_migrations SET migration_name='unknown_name'", "UNKNOWN_LEGACY_MIGRATION"],
      ["INSERT INTO public._prisma_migrations SELECT 'duplicate',checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM public._prisma_migrations", "DUPLICATE_LEGACY_MIGRATION"],
    ];
    for (const [sql, code] of scenarios) {
      // Restore the one original row between independent negative cases.
      await pg.exec("DELETE FROM public._prisma_migrations WHERE id='duplicate'");
      await pg.query("UPDATE public._prisma_migrations SET checksum=$1,finished_at='2026-01-01T01:02:04.654321Z',rolled_back_at=NULL,migration_name=$2", [set.historical[0].checksum, baseName]);
      await pg.exec(sql);
      const before = await legacyText(pg);
      await assert.rejects(runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog }), error => assertBlocked(error, code));
      assert.equal(await authorityExists(pg), false);
      assert.deepEqual(await legacyText(pg), before);
    }
  } finally { await pg.close(); }
});

test("catalog equality cannot approve a historical difference; changed/disabled triggers block adoption", async () => {
  const pg = new PGlite(), set = fixtureSet(), connection = pgConnection(pg);
  try {
    const baselineCatalog = await installLegacy(pg, set);
    set.unresolved = [{ name: baseName, installedChecksum: set.historical[0].checksum, localChecksum: "0".repeat(64), classification: "UNRESOLVED_HISTORICAL_DIFFERENCE" }];
    const before = await legacyText(pg);
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog }), error => assertBlocked(error, "UNRESOLVED_HISTORICAL_DIFFERENCE"));
    assert.equal(await authorityExists(pg), false);
    assert.deepEqual(await legacyText(pg), before);
    set.unresolved = [];
    await pg.exec("ALTER TABLE public.migration_fixture DISABLE TRIGGER migration_fixture_guard");
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog }), error => assertBlocked(error, "CATALOG_DIFFERS_FROM_BASELINE"));
    assert.equal(await authorityExists(pg), false);
    await pg.exec("ALTER TABLE public.migration_fixture ENABLE TRIGGER migration_fixture_guard");
    await pg.exec("CREATE OR REPLACE FUNCTION public.migration_fixture_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;");
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog }), error => assertBlocked(error, "CATALOG_DIFFERS_FROM_BASELINE"));
  } finally { await pg.close(); }
});

test("a failed pending batch rolls back earlier DDL/data and receipts, then a corrected retry runs once", async () => {
  const pg = new PGlite(), connection = pgConnection(pg);
  const first = migration("20270101000000_first", "CREATE TABLE public.pending_fixture(id text PRIMARY KEY); INSERT INTO public.pending_fixture VALUES ('one'); INSERT INTO public.migration_fixture VALUES ('pending',10);");
  const second = migration("20270102000000_second", "INSERT INTO public.table_that_does_not_exist VALUES (1);");
  const baselineSet = fixtureSet();
  try {
    await runDatabaseMigrations(connection, baselineSet, { command: "replay" });
    const set = fixtureSet([first, second]);
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "deploy" }), error => {
      assert.equal(error.report.result, "ROLLED_BACK");
      assert.equal(error.report.name, second.name);
      return true;
    });
    assert.equal((await rows(pg, "SELECT to_regclass('public.pending_fixture') AS name"))[0].name, null);
    assert.deepEqual(await rows(pg, "SELECT * FROM public.migration_fixture"), []);
    assert.equal(await receiptCount(pg), 1);
    const corrected = migration(second.name, "INSERT INTO public.pending_fixture VALUES ('two');");
    const correctedSet = fixtureSet([first, corrected]);
    assert.equal((await runDatabaseMigrations(connection, correctedSet, { command: "deploy" })).applied.length, 2);
    assert.deepEqual((await runDatabaseMigrations(connection, correctedSet, { command: "deploy" })).applied, []);
    assert.equal(await receiptCount(pg), 3);
    assert.deepEqual(await rows(pg, "SELECT * FROM public.pending_fixture ORDER BY id"), [{ id: "one" }, { id: "two" }]);
    const changed = fixtureSet([migration(first.name, first.executionSql + "SELECT 1;"), corrected]);
    await assert.rejects(runDatabaseMigrations(connection, changed, { command: "deploy" }), error => assertBlocked(error));
    const removed = fixtureSet([corrected]);
    await assert.rejects(runDatabaseMigrations(connection, removed, { command: "deploy" }), error => assertBlocked(error));
  } finally { await pg.close(); }
});

test("empty bootstrap failure rolls back the authority itself; existing databases never receive empty replay", async () => {
  const pg = new PGlite(), connection = pgConnection(pg);
  const bad = migration("20270101000000_bad", "CREATE TABLE public.before_failure(id integer); SELECT no_such_function();");
  try {
    await assert.rejects(runDatabaseMigrations(connection, fixtureSet([bad]), { command: "replay" }), error => assertBlocked(error));
    assert.equal(await authorityExists(pg), false);
    assert.equal((await rows(pg, "SELECT to_regclass('public.migration_fixture') AS name"))[0].name, null);
    assert.equal((await rows(pg, "SELECT to_regclass('public.before_failure') AS name"))[0].name, null);
    await assert.rejects(runDatabaseMigrations(connection, fixtureSet(), { command: "deploy" }), error => assertBlocked(error));
    await pg.exec("CREATE TABLE public.existing_data(id text); INSERT INTO public.existing_data VALUES ('keep');");
    await assert.rejects(runDatabaseMigrations(connection, fixtureSet(), { command: "replay" }), error => assertBlocked(error));
    assert.deepEqual(await rows(pg, "SELECT * FROM public.existing_data"), [{ id: "keep" }]);
    assert.equal(await authorityExists(pg), false);
    await pg.exec("DROP TABLE public.existing_data; CREATE SCHEMA pgX_existing;");
    await assert.rejects(runDatabaseMigrations(connection, fixtureSet(), { command: "replay" }), error => assertBlocked(error));
    assert.equal(await authorityExists(pg), false, "an additional schema without tables is not an empty target");
  } finally { await pg.close(); }
});

test("unrecognized authority rows, unknown receipts and missing history never pass by name", async () => {
  const pg = new PGlite(), connection = pgConnection(pg), set = fixtureSet();
  try {
    await runDatabaseMigrations(connection, set, { command: "replay" });
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "replay" }), error => assertBlocked(error));
    await pg.query("UPDATE public._celeriflow_sql_migrations SET name='unknown_name'");
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "deploy" }), error => assertBlocked(error));
    await pg.query("UPDATE public._celeriflow_sql_migrations SET name=$1", [baseName]);
    await pg.exec("DELETE FROM public._celeriflow_sql_migrations");
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "deploy" }), error => assertBlocked(error));
  } finally { await pg.close(); }
});

test("a lost COMMIT acknowledgement reports unknown outcome and a fresh deploy uses committed receipts", async () => {
  const pg = new PGlite(), connection = pgConnection(pg), set = fixtureSet();
  const lostAcknowledgement = {
    query: connection.query,
    exec: async sql => {
      const result = await connection.exec(sql);
      if (sql === "COMMIT") throw new Error("simulated transport failure after server commit");
      return result;
    },
  };
  try {
    await assert.rejects(runDatabaseMigrations(lostAcknowledgement, set, { command: "replay" }), error => {
      assert.ok(error instanceof MigrationBlockedError);
      assert.equal(error.report.result, "OUTCOME_UNKNOWN");
      return true;
    });
    assert.equal(await authorityExists(pg), true, "the server actually committed; rollback must not be falsely claimed");
    assert.equal(await receiptCount(pg), 1);
    const recovered = await runDatabaseMigrations(connection, set, { command: "deploy" });
    assert.deepEqual(recovered.applied, [], "an uncertain acknowledgement cannot cause historical SQL to run twice");
  } finally { await pg.close(); }
});
