import { and, gte, ilike, lt, lte, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function fleetSearch(value: string, ...columns: AnyPgColumn[]): SQL | undefined {
  if (!value) return undefined;
  const pattern = `%${value.replace(/[\\%_]/g, "\\$&")}%`;
  return or(...columns.map(column => ilike(column, pattern)));
}
export function fleetDates(column: AnyPgColumn, from: string, to: string, time = false, exclusiveEnd = false): SQL | undefined {
  const start = (value: string) => new Date(`${value}T00:00:00${time ? "-03:00" : "Z"}`);
  return and(from ? gte(column, start(from)) : undefined, to ? time || exclusiveEnd ? lt(column, new Date(start(to).getTime() + 86400000)) : lte(column, start(to)) : undefined);
}
