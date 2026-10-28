import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

/** Historical JSON.stringify value semantics, with no ORM payload cast. */
export function inspectionSnapshot(value: unknown): JsonValue {
  if (value === null) return null;
  if (value instanceof Date) return value.toJSON();
  if (Decimal.isDecimal(value)) return value.toJSON();
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : inspectionSnapshot(item));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, inspectionSnapshot(item)]));
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  throw new Error("Valor incompatível com snapshot JSON.");
}
