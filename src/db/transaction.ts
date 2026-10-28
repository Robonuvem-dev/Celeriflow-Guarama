import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import type { Database, DatabaseConnection } from "./connection";
import { PersistenceError } from "./errors";

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
export type TransactionOptions = PgTransactionConfig & {
  timeoutMs?: number;
  lockTimeoutMs?: number;
};

function milliseconds(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Timeout transacional inválido.");
  return `${value}ms`;
}

export async function withDatabaseTransaction<T>(
  connection: DatabaseConnection,
  operation: (tx: DatabaseTransaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { timeoutMs = 30_000, lockTimeoutMs = 10_000, ...configuration } = options;
  const timeout = milliseconds(timeoutMs);
  const lockTimeout = milliseconds(lockTimeoutMs);
  // Acquire one connection for BEGIN, every repository, COMMIT/ROLLBACK. Explicit
  // release also covers a failed BEGIN (outside Drizzle 0.45's own try/finally).
  const client = await connection.pool.connect();
  let broken = false;
  let released = false;
  let timedOut = false;
  const startedAt = Date.now();
  client.on("error", markBroken);
  function markBroken() { broken = true; }
  try {
    const transactionalDb = drizzle({ client });
    return await transactionalDb.transaction(async tx => {
      const version = await tx.execute<{ version: string }>(sql`SELECT current_setting('server_version_num') AS version`);
      if (Number(version.rows[0]?.version) < 170000) {
        throw new Error("As transações requerem PostgreSQL 17+ para preservar o timeout total.");
      }
      await tx.execute(sql`SELECT
        set_config('transaction_timeout', ${timeout}, true),
        set_config('statement_timeout', ${timeout}, true),
        set_config('idle_in_transaction_session_timeout', ${timeout}, true),
        set_config('lock_timeout', ${lockTimeout}, true)`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation(tx),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              broken = true;
              // Destroy this dedicated connection. A callback that resumes
              // later cannot write on a released/reused connection.
              released = true;
              client.release(true);
              reject(new PersistenceError("timeout", "O tempo limite da transação foi excedido."));
            }, Math.max(1, timeoutMs - (Date.now() - startedAt)));
          }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    }, configuration);
  } catch (error) {
    if (timedOut) throw new PersistenceError("timeout", "O tempo limite da transação foi excedido.", undefined, { cause: error });
    throw error;
  } finally {
    client.removeListener("error", markBroken);
    if (!released) client.release(broken);
  }
}
