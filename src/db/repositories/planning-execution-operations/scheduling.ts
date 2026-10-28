import { and, asc, eq, isNull } from "drizzle-orm";
import { planningInstruments, planningLines, planningQuotas } from "@/db/schema/planning-budget";
import { planningActions, planningPrograms } from "@/db/schema/planning-legal";
import type { ReadExecutor } from "@/lib/contracts/planning-execution-operations";

export async function readScheduleHistory(db: ReadExecutor, line: typeof planningLines.$inferSelect & { action: { code: string } | null; program: { code: string } | null }, governmentEntityId: string, year: number) {
  // Match canonical program/action codes across editions, never their row IDs.
  // The historical reader intentionally combines all LOAs of this same entity.
  const rows = await db.select({ quota: planningQuotas }).from(planningQuotas)
    .innerJoin(planningLines, eq(planningLines.id, planningQuotas.lineId))
    .innerJoin(planningInstruments, eq(planningInstruments.id, planningLines.instrumentId))
    .leftJoin(planningActions, eq(planningActions.id, planningLines.actionId))
    .leftJoin(planningPrograms, eq(planningPrograms.id, planningLines.programId))
    .where(and(eq(planningLines.year, year), eq(planningLines.kind, line.kind), eq(planningLines.budgetUnitId, line.budgetUnitId), eq(planningLines.resourceSourceId, line.resourceSourceId),
      line.revenueNatureId === null ? isNull(planningLines.revenueNatureId) : eq(planningLines.revenueNatureId, line.revenueNatureId),
      line.expenseNatureId === null ? isNull(planningLines.expenseNatureId) : eq(planningLines.expenseNatureId, line.expenseNatureId),
      line.action && line.program ? and(eq(planningActions.code, line.action.code), eq(planningPrograms.code, line.program.code)) : undefined,
      eq(planningInstruments.governmentEntityId, governmentEntityId), eq(planningInstruments.kind, "LOA")))
    .orderBy(asc(planningQuotas.month));
  return rows.map(row => row.quota);
}
