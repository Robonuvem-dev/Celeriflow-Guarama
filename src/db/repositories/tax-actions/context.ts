import { Pool } from "@neondatabase/serverless";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { getTenantContextForModuleOperation, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";

/** Open transactions on the same pool supplied by the caller's context. */
export function taxActionConnection(context: Pick<AppContext, "database">): DatabaseConnection {
  const database = context.database;
  if (!database || database === db) return databaseConnection;
  if ("$client" in database && database.$client instanceof Pool) return { db: database, pool: database.$client };
  throw new Error("O contexto tributário requer uma conexão Drizzle com pool para abrir transações.");
}

export async function taxActionContext(operation: ModuleOperation) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", operation);
  const connection = taxActionConnection(context);
  return { user: context.user, connection, database: connection.db };
}
