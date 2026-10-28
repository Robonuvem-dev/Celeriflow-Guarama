import { and, gte, ilike, lte, sql, type SQLWrapper } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";

export function managementUnitScope(column: SQLWrapper, ids: string[] | undefined) {
  return ids === undefined ? undefined : sql`${column} = ANY(${sql.param(ids)}::text[])`;
}
export function managementPeriod(column: AnyPgColumn, period: HealthManagementPeriod) {
  return and(period?.gte ? gte(column, period.gte) : undefined, period?.lte ? lte(column, period.lte) : undefined);
}
export function managementContains(column: AnyPgColumn, value: string | undefined) {
  return value ? ilike(column, `%${value}%`) : undefined;
}
export function managementRequired<T>(value: T | null | undefined, message = "Registro não encontrado."): T {
  if (value == null) throw new Error(message);
  return value;
}
