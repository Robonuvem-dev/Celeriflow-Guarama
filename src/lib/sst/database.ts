import { db, databaseConnection } from "@/db/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import type { DatabaseExecutor } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import { Pool } from "@neondatabase/serverless";

export function sstDatabase(context: AppContext): DatabaseExecutor { return context.database ?? db; }
/** Open transactions on the same pool supplied by the caller's context. */
export function sstContextConnection(context: Pick<AppContext, "database">): DatabaseConnection {
  const database = context.database;
  if (!database || database === db) return databaseConnection;
  if ("$client" in database && database.$client instanceof Pool) return { db: database, pool: database.$client };
  throw new Error("O contexto SST requer uma conexão Drizzle com pool para abrir transações.");
}
export { databaseConnection as sstConnection };
