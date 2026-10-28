import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// No global schema/relations registration: repositories import their own tables.
export type Database = NeonDatabase;

export function createDatabaseConnection(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("[database] Idle connection error", error.code || error.name);
  });
  const db: Database = drizzle({ client: pool });
  return { db, pool };
}

export type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;
