import assert from "node:assert/strict";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/** Real-driver rehearsal: SELECT and transaction-local advisory locks only. */
async function main() {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  const lockName = `CELERIFLOW_DRIZZLE_READ_ONLY_PROBE:${process.pid}:${Date.now()}`;
  let ownerReady!: () => void;
  let challengerFinished!: () => void;
  const ready = new Promise<void>(resolve => { ownerReady = resolve; });
  const challenged = new Promise<void>(resolve => { challengerFinished = resolve; });
  const options = { isolationLevel: "repeatable read", accessMode: "read only", timeoutMs: 15_000, lockTimeoutMs: 250 } as const;
  try {
    const owner = withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`);
      const { rows: [before] } = await tx.execute<{ pid: number; isolation: string; readOnly: string; transactionTimeout: string; statementTimeout: string; lockTimeout: string }>(sql`SELECT pg_backend_pid() AS pid, current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS "readOnly", current_setting('transaction_timeout') AS "transactionTimeout", current_setting('statement_timeout') AS "statementTimeout", current_setting('lock_timeout') AS "lockTimeout"`);
      ownerReady();
      await challenged;
      const { rows: [after] } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      assert.equal(after.pid, before.pid, "A transação deve conservar a mesma sessão física.");
      return before;
    }, options);
    const challenger = (async () => {
      await ready;
      try {
        return await withDatabaseTransaction(connection, async tx => {
          const { rows: [row] } = await tx.execute<{ pid: number; acquired: boolean }>(sql`SELECT pg_backend_pid() AS pid, pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) AS acquired`);
          assert.equal(row.acquired, false, "Uma segunda sessão não pode adquirir o lock ainda mantido pela primeira.");
          return row;
        }, options);
      } finally { challengerFinished(); }
    })();
    const [first, second] = await Promise.all([owner, challenger]);
    assert.notEqual(first.pid, second.pid, "O ensaio exige dois backends PostgreSQL realmente concorrentes.");
    assert.deepEqual({ isolation: first.isolation, readOnly: first.readOnly, transactionTimeout: first.transactionTimeout, statementTimeout: first.statementTimeout, lockTimeout: first.lockTimeout }, {
      isolation: "repeatable read", readOnly: "on", transactionTimeout: "15s", statementTimeout: "15s", lockTimeout: "250ms",
    });
    const released = await withDatabaseTransaction(connection, async tx => (await tx.execute<{ acquired: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) AS acquired`)).rows[0].acquired, options);
    assert.equal(released, true, "O término da transação deve liberar o lock para uma nova transação.");
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY, REAL CONCURRENT POSTGRESQL SESSIONS", checkedAt: new Date().toISOString(), independentBackends: true, stableOwnerBackend: true, isolation: first.isolation, readOnly: first.readOnly, transactionTimeout: first.transactionTimeout, statementTimeout: first.statementTimeout, lockTimeout: first.lockTimeout, contentionObserved: true, lockReleasedAtTransactionEnd: true }, null, 2));
  } finally {
    ownerReady();
    challengerFinished();
    await connection.pool.end();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : "Falha no ensaio de fronteiras transacionais."); process.exitCode = 1; });
