import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

/** Former JSON serialization boundary, expressed without ORM payload casts. */
export function economicSnapshot(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Decimal.isDecimal(value)) return value.toJSON();
  if (Array.isArray(value)) return value.map(economicSnapshot);
  if (typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) result[key] = economicSnapshot(item);
    return result;
  }
  throw new Error("Valor não serializável no cadastro econômico.");
}
