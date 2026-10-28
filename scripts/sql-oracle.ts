import { types } from "@neondatabase/serverless";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import { databaseTimestamp } from "../src/db/temporal";

/** Decode physical output fields only; JSON payloads are deliberately opaque. */
export function sqlOracleValue(oid: number, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (oid === 1700) return new Decimal(value);
  if (oid === 20) return BigInt(value);
  if ([1082, 1114, 1184].includes(oid)) return databaseTimestamp(value);
  return value;
}

/** Script-only SQL transport. The expected side never calls a repository or
 * inspects ORM metadata. PostgreSQL enforces read-only on every pool session. */
export function openReadOnlySqlOracle(connectionString: string) {
  const url = new URL(connectionString);
  const options = url.searchParams.get("options") || "";
  url.searchParams.set("options", `${options} -c default_transaction_read_only=on -c timezone=UTC`.trim());
  const connection = createDatabaseConnection(url.toString());
  async function rows<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    // Do not let pg serialize Date through the host's local timezone before a
    // timestamp-without-time-zone cast. All expected date parameters are UTC.
    const result = await connection.pool.query<T>({ text, values: values.map(value => value instanceof Date ? value.toISOString() : value), types: {
      getTypeParser(oid: number) {
        // Decode by physical result OID only, never recursively inside JSON.
        if ([20, 1082, 1114, 1184, 1700].includes(oid)) return (value: string) => value;
        return types.getTypeParser(oid, "text");
      },
    } });
    for (const row of result.rows) for (const field of result.fields) {
      Reflect.set(row, field.name, sqlOracleValue(field.dataTypeID, row[field.name]));
    }
    return result.rows;
  }
  async function first<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<T | null> {
    return (await rows<T>(text, values))[0] ?? null;
  }
  async function scalarCount(text: string, values: readonly unknown[] = []): Promise<number> {
    const row = await first<{ count: number }>(text, values);
    if (!row || typeof row.count !== "number") throw new Error("O oráculo exige count(*)::int AS count.");
    return row.count;
  }
  return { ...connection, rows, first, scalarCount };
}
export type SqlOracle = ReturnType<typeof openReadOnlySqlOracle>;

export function sqlOracleUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return url;
}

/** Contains searches intentionally retain SQL wildcard semantics. Only callers
 * whose contract is literal search should use this escaping function. */
export function literalContains(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
