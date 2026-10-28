import { and, asc, desc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../../client";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor } from "../../transaction";
import type { JsonValue } from "../../json";
import { assets } from "../../schema/assets";
import { employees } from "../../schema/administration";
import { fleetAssetEvents, fleetUnitControls, fleetUnits } from "../../schema/fleet";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";

export function fleetDatabase(context: AppContext): DatabaseExecutor { return context.database ?? db; }
export function fleetJson(value: unknown): JsonValue { return z.json().parse(JSON.parse(JSON.stringify(value))); }
export function requiredFleetRecord<T>(rows: T[], message = "Registro não encontrado ou alterado por outra sessão."): T {
  if (!rows[0]) throw new PersistenceError("not-found", message);
  return rows[0];
}
export function fleetDepartmentFilter(scope: { administrator: boolean; departmentId: string | null }, column: AnyPgColumn<{ data: string }> = fleetUnits.departmentId): SQL | undefined {
  return scope.administrator ? undefined : eq(column, scope.departmentId || "__NONE__");
}
export function fleetUnitAccess(scope: { administrator: boolean; departmentId: string | null }, unitId: string): SQL {
  return sql`exists (select 1 from "FleetUnit" u where u."id"=${unitId} and (${scope.administrator} or u."departmentId"=${scope.departmentId}))`;
}
export function fleetUnitScope(scope: { administrator: boolean; departmentId: string | null }): SQL {
  // inArray interpolates SQL verbatim; both the subquery and its OR must be
  // bounded before callers append ID, date, status or other scope filters.
  return sql`(select "id" from "FleetUnit" where (${scope.administrator} or "departmentId"=${scope.departmentId}))`;
}
export async function countFleetRecords(db: DatabaseExecutor, table: PgTable, where?: SQL): Promise<number> {
  const result = await db.execute<{ total: string }>(sql`select count(*)::text as total from ${table} ${where ? sql`where ${where}` : sql``}`);
  return Number(result.rows[0].total);
}
export async function readFleetUnits(db: DatabaseExecutor, where?: SQL, options: { limit?: number; offset?: number; byId?: boolean } = {}) {
  const parent = alias(fleetUnits, "fleet_parent");
  const rows = await db.select({ ...getTableColumns(fleetUnits), control: getTableColumns(fleetUnitControls), asset: getTableColumns(assets), responsible: { id: employees.id, name: employees.name }, parent: { id: parent.id, code: parent.code, name: parent.name } })
    .from(fleetUnits).leftJoin(fleetUnitControls, eq(fleetUnitControls.unitId, fleetUnits.id)).leftJoin(assets, eq(assets.id, fleetUnits.assetId)).leftJoin(employees, eq(employees.id, assets.responsibleId)).leftJoin(parent, eq(parent.id, fleetUnits.parentId))
    .where(where).orderBy(asc(fleetUnits.code), ...(options.byId ? [asc(fleetUnits.id)] : [])).limit(options.limit ?? 2147483647).offset(options.offset ?? 0);
  return rows.map(({ asset, responsible, ...unit }) => ({ ...unit, asset: asset ? { ...asset, responsible } : null }));
}
export async function readFleetAssetEvents(db: DatabaseExecutor, unitIds: string[]) {
  if (!unitIds.length) return [];
  // Keep the last twenty events per unit, not twenty for the complete page.
  const events = await db.select().from(fleetAssetEvents).where(inArray(fleetAssetEvents.unitId, unitIds)).orderBy(desc(fleetAssetEvents.createdAt), desc(fleetAssetEvents.id));
  const counts = new Map<string, number>();
  return events.filter(event => { const count = counts.get(event.unitId) || 0; counts.set(event.unitId, count + 1); return count < 20; });
}
export async function readFleetUnit(db: DatabaseExecutor, scope: { administrator: boolean; departmentId: string | null }, id: string) {
  return (await readFleetUnits(db, and(eq(fleetUnits.id, id), fleetDepartmentFilter(scope)), { limit: 1 }))[0] ?? null;
}
