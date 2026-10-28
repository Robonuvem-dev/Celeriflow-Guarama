import { sql } from "drizzle-orm";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

// Drizzle treats a JS null as SQL NULL; use JsonNull for the JSON null literal.
export const JsonNull = sql`'null'::jsonb`;
export const DbNull = null;
