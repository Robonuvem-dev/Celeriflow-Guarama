import type { JsonObject, JsonValue } from "@/db/json";

export function taxRegistrySnapshot(value?: JsonValue | null): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
