import type { SQL } from "drizzle-orm";
import type { QueryResultRow } from "@neondatabase/serverless";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";

/** Raw SQL boundary. Call sites declare wire DTOs and decode dates/decimals explicitly. */
export async function sstRows<T extends QueryResultRow>(database: DatabaseExecutor, statement: SQL) {
  return (await database.execute<T>(statement)).rows;
}
/** The legacy timestamp-without-time-zone columns represent UTC instants. */
export function sstTimestamp(value: string): Date {
  return databaseTimestamp(value);
}
