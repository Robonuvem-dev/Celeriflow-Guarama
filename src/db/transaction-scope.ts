import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseConnection } from "./connection";
import type { DatabaseTransaction } from "./transaction";

const scope = new AsyncLocalStorage<{ connection: DatabaseConnection; transaction: DatabaseTransaction }>();

/** Explicit opt-in for rollback-only rehearsals that call transactional services.
 * Nested service transactions use Drizzle's native PostgreSQL savepoints. */
export function inDatabaseTransactionScope<T>(connection: DatabaseConnection, transaction: DatabaseTransaction, operation: () => Promise<T>) {
  return scope.run({ connection, transaction }, operation);
}

export function scopedDatabaseTransaction(connection: DatabaseConnection) {
  const current = scope.getStore();
  return current?.connection === connection ? current.transaction : undefined;
}
