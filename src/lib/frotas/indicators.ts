import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { departmentWhere, fleetScope } from "./service";

/** FleetExpense projects consumption and maintenance: its sources must not be added again. */
export async function getFleetExpenseIndicators(context: AppContext, from: Date, to: Date) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new Error("Período de indicadores inválido.");
  const scope = fleetScope(context);
  const where: Prisma.FleetExpenseWhereInput = { unit: departmentWhere(scope), occurredAt: { gte: from, lte: to } };
  return context.prisma.$transaction(async (tx) => {
    const [total, sum, missing, groups] = await Promise.all([
      tx.fleetExpense.count({ where }),
      tx.fleetExpense.aggregate({ where, _sum: { amount: true } }),
      tx.fleetExpense.count({ where: { AND: [where, { amount: null }] } }),
      tx.fleetExpense.groupBy({ by: ["nature"], where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return { total, knownAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), missing, complete: missing === 0, groups: groups.map((row) => ({ nature: row.nature, amount: (row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), count: row._count._all })) };
  }, { isolationLevel: "RepeatableRead" });
}
