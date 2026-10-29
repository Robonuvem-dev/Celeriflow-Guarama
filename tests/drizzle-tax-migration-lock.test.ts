import assert from "node:assert/strict";
import test from "node:test";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { migrationLock, MigrationBlockedError } from "../scripts/database-migrate-core.mjs";
import { inspectTaxFinalMigrationAuthority } from "../src/db/repositories/tax-final-helpers/migration-inspection";
import { inspectHrMigrations } from "../scripts/deploy-hr-migrations";
import { inspectCemeteryMigrations } from "../scripts/deploy-cemetery-migrations";
import { createPlanningPostgresBackend } from "./helpers/planning-postgres-backend";

test("Tax migration wrappers: real PostgreSQL sessions reject the core transactional lock and release it on rollback", {
  timeout: 15000,
  skip: process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL ? false : "Requer scripts/verify-planning-postgres.mjs e PostgreSQL real local planning_s2; sem fallback PGlite.",
}, async () => {
  const url = process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL;
  assert.ok(url, "Execute este teste com scripts/verify-planning-postgres.mjs: exige PostgreSQL real local planning_s2, sem fallback PGlite.");
  const holder = await createPlanningPostgresBackend(url);
  try {
    const inspector = await createPlanningPostgresBackend(url);
    try {
      const set = loadMigrationSet();
      const timeouts = { statementTimeoutMs: 2000, lockTimeoutMs: 1000 };
      const holderPid = (await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const inspectorPid = (await inspector.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      assert.notEqual(holderPid, inspectorPid, "Lock contention requires distinct PostgreSQL sessions");
      const authorityRelations = async () => (await inspector.query("SELECT to_regclass('public._celeriflow_sql_state')::text AS state, to_regclass('public._celeriflow_sql_migrations')::text AS receipts")).rows;
      const before = await authorityRelations();
      await holder.exec("BEGIN");
      try {
        await holder.query("SELECT pg_advisory_xact_lock($1::integer,$2::integer)", migrationLock);
        const blockedByLock = (error: unknown) => {
          assert.ok(error instanceof MigrationBlockedError);
          assert.match(error.message, /lock/i);
          assert.equal(error.report.code, "MIGRATION_LOCK_BUSY");
          return true;
        };
        await assert.rejects(inspectTaxFinalMigrationAuthority(inspector, set, ["20261011010000_cemetery_integrity"], false, timeouts), blockedByLock);
        for (const apply of [false, true]) {
          await assert.rejects(inspectHrMigrations(inspector, set, apply ? ["--apply"] : [], timeouts), blockedByLock);
          await assert.rejects(inspectCemeteryMigrations(inspector, set, apply, timeouts), blockedByLock);
        }
        assert.deepEqual(await authorityRelations(), before);
      } finally {
        await holder.exec("ROLLBACK");
      }
      await inspector.exec("BEGIN");
      try {
        const released = await inspector.query("SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired", migrationLock);
        assert.equal(released.rows[0].acquired, true, "Holder rollback releases the production migration lock");
      } finally {
        await inspector.exec("ROLLBACK");
      }
      assert.deepEqual(await authorityRelations(), before);
    } finally {
      await inspector.close();
    }
  } finally {
    await holder.close();
  }
});
