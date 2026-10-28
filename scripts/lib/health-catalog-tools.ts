import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../src/db/transaction";

export function healthCatalogRequired<T>(value: T | null | undefined, model: string): T {
  if (value == null) throw new Error(`${model} não encontrado.`);
  return value;
}

export async function lockHealthCatalogTool(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}

export function healthCatalogConfigurationHash(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload) && "configurationHash" in payload
    ? payload.configurationHash
    : undefined;
}
