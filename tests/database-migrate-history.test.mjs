import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { captureMigrationCatalog } from "../scripts/database-migrate-catalog.mjs";
import { MigrationBlockedError, runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { loadMigrationSet, sha256, stableJson } from "../scripts/database-migrate-files.mjs";

// Separate file so the parent can schedule the real 156-migration replay after
// lighter domain checks, one PGlite instance at a time on the 7.7 GiB machine.
test("the new authority replays all 156 unmodified SQL sources, including four envelopes, and deploy repeats no SQL", { timeout: 180_000 }, async () => {
  const pg = new PGlite();
  const connection = { query: (sql, parameters) => pg.query(sql, parameters), exec: sql => pg.exec(sql) };
  const set = loadMigrationSet();
  const own = new Set(["_celeriflow_sql_state", "_celeriflow_sql_migrations"]);
  try {
    const report = await runDatabaseMigrations(connection, set, { command: "replay" });
    assert.equal(report.origin, "replayed");
    assert.equal(report.applied.length, set.migrations.length);
    assert.equal(set.historical.length, 156);
    assert.equal(report.historicalDifferences.length, 1, "replay must not silently reconcile the remaining installed checksum history");
    assert.equal(report.provenHistoricalVariants.length, 1);
    const receiptRows = (await pg.query("SELECT * FROM public._celeriflow_sql_migrations ORDER BY position")).rows;
    assert.equal(receiptRows.length, set.migrations.length);
    for (let index = 0; index < receiptRows.length; index++) {
      assert.equal(receiptRows[index].name, set.migrations[index].name);
      assert.equal(receiptRows[index].checksum, set.migrations[index].checksum, "receipt hashes include the original BEGIN/COMMIT bytes");
      assert.equal(receiptRows[index].origin, "executed");
      assert.equal(stableJson(receiptRows[index].historical_provenance), stableJson(set.migrations[index].historicalProof));
    }
    assert.equal((await pg.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0].name, null, "a new replay does not invent installed Prisma history");
    const catalog = await captureMigrationCatalog(connection);
    const publicOnly = (kind, values) => values.filter(row => (row.schema ?? row.schemaname) === "public" && !own.has(row.table_name ?? row.name ?? row.tablename) && (kind !== "constraints" || row.type !== "n"));
    const expected = set.recovery.replay;
    const counts = { tables: "relations", columns: "columns", constraints: "constraintsExcludingPg18NotNullObjects", indexes: "indexes", functions: "functions", triggers: "triggers", enums: "enumLabels", views: "views", sequences: "sequences" };
    // Counts refer to the historical baseline. New migrations may intentionally
    // change these counts, so compare before adding future SQL to this fixture.
    if (set.future.length === 0) for (const [kind, evidence] of Object.entries(counts)) {
      assert.equal(publicOnly(kind, catalog[kind]).length, expected[evidence], `${kind}: recorded recovery baseline`);
    }
    const second = await runDatabaseMigrations(connection, set, { command: "deploy" });
    assert.deepEqual(second.applied, []);
    assert.equal(second.recorded, set.migrations.length);
    const proved = set.historical.find(migration => migration.historicalProof);
    const provedReceipt = receiptRows.find(receipt => receipt.name === proved.name);
    assert.equal(provedReceipt.historical_provenance.installedChecksum, "5fdfa81973db5e6bab704e102550a52eac2dbd9773151eae576923e509194cbd");
    assert.notEqual(provedReceipt.checksum, provedReceipt.historical_provenance.installedChecksum, "both local execution bytes and installed mixed-ending bytes are retained separately");
    await pg.query("UPDATE public._celeriflow_sql_migrations SET historical_provenance='{}'::jsonb WHERE name=$1", [proved.name]);
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "deploy" }), /historical byte proof changed/);
    await pg.query("UPDATE public._celeriflow_sql_migrations SET historical_provenance=$1::jsonb WHERE name=$2", [JSON.stringify(proved.historicalProof), proved.name]);

    // A disposable fixture of the 156 recorded installed checksums, distinct
    // from a snapshot restoration. Equal final catalogs must still not turn
    // the remaining unresolved history into an approved adopted receipt.
    await pg.exec(`DROP TABLE public._celeriflow_sql_migrations,public._celeriflow_sql_state;
      CREATE TABLE public._prisma_migrations (
        id text PRIMARY KEY, checksum text NOT NULL, migration_name text NOT NULL,
        started_at timestamptz NOT NULL, finished_at timestamptz,
        rolled_back_at timestamptz, logs text, applied_steps_count integer NOT NULL
      );`);
    const installed = set.historical.map((migration, index) => ({ id: `fixture-${index}`, checksum: migration.provenance.installedChecksum, migration_name: migration.name }));
    await pg.query(`INSERT INTO public._prisma_migrations
      SELECT id,checksum,migration_name,'2026-10-28T00:00:00.123456Z'::timestamptz,'2026-10-28T00:00:01.654321Z'::timestamptz,NULL,NULL,1
      FROM json_to_recordset($1::json) AS r(id text,checksum text,migration_name text)`, [JSON.stringify(installed)]);
    const adoptionCatalog = await captureMigrationCatalog(connection);
    const baselineCatalog = { catalog: adoptionCatalog, fileSha256: sha256(stableJson(adoptionCatalog)) };
    const ledger = async () => (await pg.query("SELECT row_to_json(m)::text AS document FROM public._prisma_migrations m ORDER BY migration_name")).rows;
    const before = await ledger();
    const adoptionPlan = await runDatabaseMigrations(connection, set, { command: "plan", baselineCatalog });
    assert.equal(adoptionPlan.result, "ADOPTION_BLOCKED");
    assert.deepEqual(adoptionPlan.catalog.differences, []);
    assert.deepEqual(adoptionPlan.issues.map(issue => issue.name), set.unresolved.map(issue => issue.name));
    await assert.rejects(runDatabaseMigrations(connection, set, { command: "adopt", baselineCatalog }), error => {
      assert.ok(error instanceof MigrationBlockedError);
      assert.equal(error.report.issues.length, 1);
      assert.ok(error.report.issues.every(issue => issue.code === "UNRESOLVED_HISTORICAL_DIFFERENCE"));
      return true;
    });
    assert.equal((await pg.query("SELECT to_regclass('public._celeriflow_sql_state') AS name")).rows[0].name, null);
    assert.deepEqual(await ledger(), before);
    assert.equal(stableJson(await captureMigrationCatalog(connection)), stableJson(adoptionCatalog), "blocked adoption preserves all objects and triggers");
  } finally { await pg.close(); }
});
