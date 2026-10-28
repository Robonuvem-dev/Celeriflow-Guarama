import { and, count, gte, inArray, isNull, lte, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { fleetExpenses } from "@/db/schema/fleet";
import { fleetUnitScope } from "@/db/repositories/fleet/records";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import { fleetScope } from "./service";

/** FleetExpense projects consumption and maintenance: its sources must not be added again. */
export async function getFleetExpenseIndicators(context: AppContext, from: Date, to: Date, connection: DatabaseConnection = databaseConnection) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new Error("Período de indicadores inválido.");
  const scope = fleetScope(context);
  const where = and(inArray(fleetExpenses.unitId, fleetUnitScope(scope)), gte(fleetExpenses.occurredAt, from), lte(fleetExpenses.occurredAt, to));
  return withDatabaseTransaction(connection, async (tx) => {
    const [[totals], [unknown], groups] = await Promise.all([
      tx.select({ total: count(), amount: sum(fleetExpenses.amount) }).from(fleetExpenses).where(where),
      tx.select({ total: count() }).from(fleetExpenses).where(and(where, isNull(fleetExpenses.amount))),
      tx.select({ nature: fleetExpenses.nature, amount: sum(fleetExpenses.amount), count: count() }).from(fleetExpenses).where(where).groupBy(fleetExpenses.nature),
    ]);
    return { total: totals.total, knownAmount: new Decimal(totals.amount || 0).toFixed(2), missing: unknown.total, complete: unknown.total === 0, groups: groups.map(row => ({ nature: row.nature, amount: new Decimal(row.amount || 0).toFixed(2), count: row.count })) };
  }, { isolationLevel: "repeatable read" });
}
