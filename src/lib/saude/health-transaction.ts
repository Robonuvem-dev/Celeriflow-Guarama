import { databaseConnection } from "@/db/client";
import { getPostgresError, PersistenceError } from "@/db/errors";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import type { AppContext } from "@/lib/platform/tenant-context";

export class HealthOperationError extends Error {}

export function healthDatabaseConnection(context: Pick<AppContext, "database"> & { databaseConnection?: DatabaseConnection }) {
  return context.databaseConnection ?? databaseConnection;
}

export async function runHealthTransaction<T>(
  context: Pick<AppContext, "database"> & { databaseConnection?: DatabaseConnection },
  operation: (tx: DatabaseTransaction) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await withDatabaseTransaction(healthDatabaseConnection(context), operation, { isolationLevel: "serializable", timeoutMs: 15_000 });
    } catch (error) {
      const code = getPostgresError(error)?.code;
      if (attempt < 2 && (code === "40001" || code === "40P01" || error instanceof PersistenceError && ["serialization", "deadlock"].includes(error.kind))) continue;
      throw error;
    }
  }
  throw new HealthOperationError("Nao foi possivel confirmar a operacao concorrente. Reabra a agenda e tente novamente.");
}
