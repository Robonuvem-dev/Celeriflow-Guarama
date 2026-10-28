import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { captureMigrationCatalog, loadBaselineCatalog } from "../scripts/database-migrate-catalog.mjs";
import { loadMigrationSet, repositoryRoot, sha256, stableJson } from "../scripts/database-migrate-files.mjs";
import { MigrationBlockedError, runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { prepareMigrationSql } from "../scripts/database-migrate-sql.mjs";

// Parent queue only. Uses the actual 156-source inventory/byte proofs and full
// installed rows, with a small physical catalog. The TEST-ONLY authorization is
// explicitly re-bound to this disposable catalog, never to the production one.
async function fixture() {
  const pg = new PGlite();
  const connection = { query: (sql, params) => pg.query(sql, params), exec: sql => pg.exec(sql) };
  // This authority fixture has only baseline_data, rather than the application's
  // 1,006 historical tables. App-specific future SQL is covered by full replay;
  // each test below supplies its own physical future on this isolated catalog.
  const loaded = loadMigrationSet();
  const set = withFuture(loaded, []);
  const parent = join(repositoryRoot, ".agent", "drizzle");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "audited-baseline-test-"));
  const rows = async (sql, params) => (await pg.query(sql, params)).rows;
  try {
    await pg.exec(`CREATE TABLE public.baseline_data(id text PRIMARY KEY, value numeric(24,6) NOT NULL, moment timestamp(6) NOT NULL);
      CREATE FUNCTION public.baseline_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value<0 THEN RAISE EXCEPTION 'baseline guard preserved'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER baseline_guard BEFORE UPDATE ON public.baseline_data FOR EACH ROW EXECUTE FUNCTION public.baseline_guard();
      INSERT INTO public.baseline_data VALUES ('kept',123456789012345678.123456,'2026-10-28 01:02:03.654321');
      CREATE TABLE public._prisma_migrations(id text PRIMARY KEY,checksum text NOT NULL,migration_name text NOT NULL,started_at timestamptz NOT NULL,finished_at timestamptz,rolled_back_at timestamptz,logs text,applied_steps_count integer NOT NULL);
      SET timezone='America/Sao_Paulo';`);
    const legacy = set.historical.map((migration, index) => ({ id: `original-${index}`, checksum: migration.provenance.installedChecksum, migration_name: migration.name, started_at: "2026-10-28T00:00:00.123456Z", finished_at: "2026-10-28T00:00:01.654321Z", rolled_back_at: null, logs: `original ${index} ' "`, applied_steps_count: 1 }));
    const restoreLegacy = async () => {
      await pg.exec("DELETE FROM public._prisma_migrations");
      await pg.query("INSERT INTO public._prisma_migrations SELECT * FROM json_populate_recordset(NULL::public._prisma_migrations,$1::json)", [JSON.stringify(legacy)]);
    };
    await restoreLegacy();
    const catalog = await captureMigrationCatalog(connection);
    const catalogBytes = JSON.stringify({ catalog });
    const catalogPath = join(directory, "catalog.json");
    writeFileSync(catalogPath, catalogBytes);
    const baselineCatalog = loadBaselineCatalog(catalogPath, sha256(catalogBytes));
    const manifest = set.auditedBaseline.manifest;
    manifest.authorization.id = "TEST-ONLY-disposable-catalog";
    manifest.reviewedCatalog = { source: "fixture/catalog.json", fileSha256: baselineCatalog.fileSha256, digest: baselineCatalog.digest };
    set.auditedBaseline.digest = sha256(stableJson(manifest));
    set.policy.auditedBaseline.manifestDigest = set.auditedBaseline.digest;
    const options = { command: "baseline", baselineCatalog, baselineManifestDigest: set.auditedBaseline.digest };
    const ledger = () => rows("SELECT row_to_json(m)::text AS document FROM public._prisma_migrations m ORDER BY migration_name,id");
    const authority = async () => (await rows("SELECT to_regclass('public._celeriflow_sql_state') AS name"))[0].name;
    // Every historical execution is a fatal sentinel: initialization must only
    // read/hash the actual sources, not execute any of their 156 bodies.
    for (const migration of set.historical) migration.executionSql = "SELECT historical_sql_must_never_execute();";
    return { pg, connection, set, options, rows, ledger, restoreLegacy, authority, close: async () => { await pg.close(); rmSync(directory, { recursive: true, force: true }); } };
  } catch (error) { await pg.close(); rmSync(directory, { recursive: true, force: true }); throw error; }
}
function future(name = "20270101000000_baseline_future", sql = "ALTER TABLE public.baseline_data ADD COLUMN note text;\nINSERT INTO public.baseline_data(id,value,moment,note) VALUES ('future',1,'2027-01-01','once');\n") {
  const lfSql = sql.replaceAll("\r\n", "\n");
  return { name, source: `db/migrations/${name}/migration.sql`, historical: false, checksum: sha256(sql), lfChecksum: sha256(lfSql), byteVariants: [...new Set([sha256(sql), sha256(lfSql), sha256(lfSql.replaceAll("\n", "\r\n"))])], historicalProof: null, ...prepareMigrationSql(sql, { name }) };
}
function withFuture(set, migrations) { return { ...set, future: migrations, migrations: [...set.historical, ...migrations] }; }
const blocked = error => { assert.ok(error instanceof MigrationBlockedError); return true; };

test("baseline records all 156 as baselined, preserves ledger/data/trigger/microseconds, never executes history; future deploy is exactly once without private catalog", async () => {
  const f = await fixture();
  try {
    const migration = future(), set = withFuture(f.set, [migration]);
    const before = await f.ledger();
    const data = await f.rows("SELECT id,value::text,moment::text FROM public.baseline_data");
    const catalog = await captureMigrationCatalog(f.connection);
    assert.equal((await runDatabaseMigrations(f.connection, set, { command: "plan", baselineCatalog: f.options.baselineCatalog })).result, "ADOPTION_BLOCKED");
    await assert.rejects(runDatabaseMigrations(f.connection, set, { command: "adopt", baselineCatalog: f.options.baselineCatalog }), blocked);
    assert.equal((await runDatabaseMigrations(f.connection, set, { ...f.options, command: "plan" })).result, "READY_TO_BASELINE");
    assert.equal(await f.authority(), null);
    const result = await runDatabaseMigrations(f.connection, set, f.options);
    assert.equal(result.origin, "baselined"); assert.equal(result.baselined, 156); assert.deepEqual(result.applied, []);
    assert.equal(result.historicalDifferences[0].classification, "UNRESOLVED_HISTORICAL_DIFFERENCE");
    assert.deepEqual(await f.ledger(), before);
    assert.deepEqual(await f.rows("SELECT id,value::text,moment::text FROM public.baseline_data"), data);
    assert.deepEqual(await captureMigrationCatalog(f.connection).then(c => Object.fromEntries(Object.entries(c).map(([kind, rows]) => [kind, rows.filter(row => !String(row.table_name ?? row.name ?? row.tablename).startsWith("_celeriflow_sql_"))]))), catalog);
    const receipts = await f.rows("SELECT * FROM public._celeriflow_sql_migrations ORDER BY position");
    assert.equal(receipts.length, 156);
    for (const [at, receipt] of receipts.entries()) {
      assert.equal(receipt.origin, "baselined"); assert.equal(receipt.checksum, set.historical[at].checksum);
      assert.deepEqual(receipt.legacy_row, JSON.parse(before[at].document));
      assert.match(receipt.legacy_row.started_at, /\.123456/); assert.match(receipt.legacy_row.finished_at, /\.654321/);
    }
    const clinical = receipts.find(row => row.name === set.unresolved[0].name);
    assert.equal(clinical.historical_provenance.byteProof, null);
    assert.equal(clinical.historical_provenance.auditedBaseline.unresolvedDifference.classification, "UNRESOLVED_HISTORICAL_DIFFERENCE");
    await assert.rejects(f.pg.exec("UPDATE public.baseline_data SET value=-1"), /baseline guard preserved/);
    assert.deepEqual((await runDatabaseMigrations(f.connection, set, { command: "deploy" })).applied, [migration.name]);
    assert.deepEqual((await runDatabaseMigrations(f.connection, set, { command: "deploy" })).applied, []);
    assert.equal((await f.rows("SELECT count(*)::int AS n FROM public.baseline_data WHERE id='future'"))[0].n, 1);
    assert.deepEqual(await f.ledger(), before);
    await assert.rejects(runDatabaseMigrations(f.connection, set, f.options), /already initialized/);
  } finally { await f.close(); }
});

test("baseline refuses changed/unknown/duplicate/incomplete/missing installed rows and catalog drift; recapture cannot approve drift", async () => {
  const f = await fixture();
  try {
    const changes = [
      "UPDATE public._prisma_migrations SET checksum=repeat('0',64) WHERE id='original-0'",
      "UPDATE public._prisma_migrations SET migration_name='unknown' WHERE id='original-0'",
      "INSERT INTO public._prisma_migrations SELECT 'duplicate',checksum,migration_name,started_at,finished_at,rolled_back_at,logs,applied_steps_count FROM public._prisma_migrations WHERE id='original-0'",
      "UPDATE public._prisma_migrations SET finished_at=NULL WHERE id='original-0'",
      "UPDATE public._prisma_migrations SET rolled_back_at=now() WHERE id='original-0'",
      "DELETE FROM public._prisma_migrations WHERE id='original-0'",
    ];
    for (const sql of changes) {
      await f.pg.exec(sql);
      const before = await f.ledger();
      await assert.rejects(runDatabaseMigrations(f.connection, f.set, f.options), blocked);
      assert.equal(await f.authority(), null); assert.deepEqual(await f.ledger(), before);
      await f.restoreLegacy();
    }
    await f.pg.exec("ALTER TABLE public.baseline_data DISABLE TRIGGER baseline_guard");
    await assert.rejects(runDatabaseMigrations(f.connection, f.set, f.options), error => { assert.ok(error.report.issues.some(issue => issue.code === "CATALOG_DIFFERS_FROM_BASELINE")); return true; });
    const drift = { ...f.options.baselineCatalog, fileSha256: sha256("recaptured drift"), catalog: await captureMigrationCatalog(f.connection) };
    await assert.rejects(runDatabaseMigrations(f.connection, f.set, { ...f.options, baselineCatalog: drift }), /original reviewed reference/);
    assert.equal(await f.authority(), null);
  } finally { await f.close(); }
});

test("receipt failure rolls back baseline authority and releases transaction lock; retry initializes once", async () => {
  const f = await fixture();
  try {
    const before = await f.ledger();
    const injected = { ...f.connection, query: async (sql, params) => {
      if (sql.startsWith("INSERT INTO public._celeriflow_sql_migrations") && params[1] === 50) throw new Error("receipt failure");
      return f.connection.query(sql, params);
    } };
    await assert.rejects(runDatabaseMigrations(injected, f.set, f.options), /receipt failure/);
    assert.equal(await f.authority(), null); assert.deepEqual(await f.ledger(), before);
    assert.equal((await runDatabaseMigrations(f.connection, f.set, f.options)).baselined, 156);
  } finally { await f.close(); }
});

test("baseline COMMIT acknowledgement loss stays OUTCOME_UNKNOWN; fresh deploy recovers receipts and future acknowledgement loss never reexecutes SQL", async () => {
  const f = await fixture();
  try {
    const loss = { ...f.connection, exec: async sql => { const value = await f.connection.exec(sql); if (sql === "COMMIT") throw new Error("ack lost"); return value; } };
    const unknown = error => { assert.equal(error.report.result, "OUTCOME_UNKNOWN"); return true; };
    await assert.rejects(runDatabaseMigrations(loss, f.set, f.options), unknown);
    assert.notEqual(await f.authority(), null);
    assert.deepEqual((await runDatabaseMigrations(f.connection, f.set, { command: "deploy" })).applied, []);
    const set = withFuture(f.set, [future()]);
    await assert.rejects(runDatabaseMigrations(loss, set, { command: "deploy" }), unknown);
    assert.deepEqual((await runDatabaseMigrations(f.connection, set, { command: "deploy" })).applied, []);
    assert.equal((await f.rows("SELECT count(*)::int AS n FROM public.baseline_data WHERE id='future'"))[0].n, 1);
  } finally { await f.close(); }
});

test("post-baseline ledger/manifest/receipt tampering and future raw-byte changes block deploy before new SQL", async () => {
  const f = await fixture();
  try {
    await runDatabaseMigrations(f.connection, f.set, f.options);
    await f.pg.exec("UPDATE public._prisma_migrations SET logs='changed' WHERE id='original-0'");
    await assert.rejects(runDatabaseMigrations(f.connection, f.set, { command: "deploy" }), /preserved installed ledger/);
    await f.restoreLegacy();
    const changed = { ...f.set, policy: structuredClone(f.set.policy), auditedBaseline: structuredClone(f.set.auditedBaseline) };
    changed.auditedBaseline.manifest.authorization.id = "different-authorization";
    changed.auditedBaseline.digest = sha256(stableJson(changed.auditedBaseline.manifest));
    changed.policy.auditedBaseline.manifestDigest = changed.auditedBaseline.digest;
    await assert.rejects(runDatabaseMigrations(f.connection, changed, { command: "deploy" }), /authorization\/catalog binding changed/);
    const originalProof = (await f.rows("SELECT historical_provenance FROM public._celeriflow_sql_migrations WHERE position=1"))[0].historical_provenance;
    await f.pg.exec("UPDATE public._celeriflow_sql_migrations SET historical_provenance='{}'::jsonb WHERE position=1");
    await assert.rejects(runDatabaseMigrations(f.connection, f.set, { command: "deploy" }), /historical byte proof changed/);
    await f.pg.query("UPDATE public._celeriflow_sql_migrations SET historical_provenance=$1::jsonb WHERE position=1", [JSON.stringify(originalProof)]);
    const migration = future(), set = withFuture(f.set, [migration]);
    await runDatabaseMigrations(f.connection, set, { command: "deploy" });
    const changedEndings = future(migration.name, migration.executionSql.replaceAll("\n", "\r\n"));
    assert.equal(changedEndings.lfChecksum, migration.lfChecksum); assert.notEqual(changedEndings.checksum, migration.checksum);
    await assert.rejects(runDatabaseMigrations(f.connection, withFuture(f.set, [changedEndings]), { command: "deploy" }), /changed SQL receipt\/source/);
    await assert.rejects(runDatabaseMigrations(f.connection, f.set, { command: "deploy" }), /complete known baseline\/prefix/);
    assert.equal((await f.rows("SELECT count(*)::int AS n FROM public.baseline_data WHERE id='future'"))[0].n, 1);
  } finally { await f.close(); }
});
