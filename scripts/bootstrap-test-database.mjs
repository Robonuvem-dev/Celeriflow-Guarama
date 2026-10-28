import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection.ts";
import { withDatabaseTransaction } from "../src/db/transaction.ts";
import { seedBootstrapTestFixture } from "../prisma/bootstrap-test/seed.ts";
import { resolveBootstrapTestTarget } from "./lib/cross-domain-bootstrap-test-target.ts";
import { resetBootstrapTestSchema } from "./lib/cross-domain-bootstrap-test-reset.mjs";
import { loadMigrationSet } from "./database-migrate-files.mjs";
import { migrationLock, runDatabaseMigrations } from "./database-migrate-core.mjs";
import { openMigrationConnection } from "./database-migrate-driver.mjs";

export async function bootstrapTestDatabaseMain(environment = process.env) {
  const target = resolveBootstrapTestTarget(environment);
  // Validate all preserved SQL/provenance before resetting anything.
  const set = loadMigrationSet();
  const connection = await openMigrationConnection(target.connectionString);
  let locked = false;
  try {
    // A session-level lock spans reset, replay and seed. The executor's own
    // transaction lock is reentrant on this same physical migration connection.
    const [lock] = (await connection.query("SELECT pg_try_advisory_lock($1::integer,$2::integer) AS acquired", migrationLock)).rows;
    if (!lock?.acquired) throw new Error("Another SQL migration/bootstrap holds the database lock.");
    locked = true;
    await resetBootstrapTestSchema(connection, environment);
    const replay = await runDatabaseMigrations(connection, set, { command: "replay" });
    const fixtureConnection = createDatabaseConnection(target.connectionString);
    try {
      await withDatabaseTransaction(fixtureConnection, seedBootstrapTestFixture, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
    } finally { await fixtureConnection.pool.end(); }
    return { result: "PASS", migrations: replay.applied.length, origin: replay.origin, fixture: "MINIMAL_FINANCE_AUDIT", legacyLedgerFabricated: false };
  } finally {
    if (locked) await connection.query("SELECT pg_advisory_unlock($1::integer,$2::integer)", migrationLock).catch(() => {});
    await connection.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  config({ path: ".env.local", quiet: true });
  // TSX may load this API from a CommonJS TypeScript test. Keep all await
  // expressions inside async functions, including in the CLI-only branch.
  void bootstrapTestDatabaseMain().then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    // Never print a driver stack/URL: the destination is exclusively TEST_*.
    console.error(JSON.stringify({ result: error.report?.result ?? "ERROR", message: error.code || error.cause ? "Dedicated test database bootstrap failed." : error.message, code: error.code ?? null }));
    process.exitCode = 1;
  });
}
