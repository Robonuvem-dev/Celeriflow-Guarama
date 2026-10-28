import { count, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../src/db/transaction";

/** Cardinality check on an actual typed Drizzle select/returning query. */
export async function one<T>(query: PromiseLike<T[]>): Promise<T> {
  const rows = await query;
  if (!rows.length) throw new Error("Registro obrigatório da checklist não encontrado.");
  return rows[0];
}

export async function countRows(database: DatabaseExecutor, table: PgTable, predicate?: SQL) {
  const [row] = await database.select({ value: count() }).from(table).where(predicate);
  return row.value;
}

/** assert.rejects keeps its original message regexp, but accepts it only from
 * the SAME PostgreSQL cause carrying SQLSTATE P0001, never from Failed query. */
export function rethrowDatabaseGuard(error: unknown): never {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "P0001" && "message" in current && typeof current.message === "string") throw new Error(current.message, { cause: error });
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}
