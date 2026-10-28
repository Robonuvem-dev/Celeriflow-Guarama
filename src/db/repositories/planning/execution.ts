import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { planningBudgetLaws, planningCreditBatches, planningCreditLines, planningEntityUnits, planningInstruments, planningLines, planningQuotas } from "@/db/schema/planning-budget";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";

export async function planningRuntimeReady(db: DatabaseExecutor) {
  const result = await db.execute<{ ready: boolean }>(sql`SELECT (to_regclass('"PlanningBudgetLine"') IS NOT NULL AND to_regclass('"PlanningQuotaEvent"') IS NOT NULL AND to_regclass('"PlanningCreditLine"') IS NOT NULL) AS ready`);
  return result.rows[0]?.ready === true;
}

export async function readAdoptedPlanningLine(db: DatabaseExecutor, appropriationId: string) {
  const [row] = await db.select({ line: planningLines, instrument: planningInstruments, annualBudgetLaw: planningBudgetLaws }).from(planningLines).innerJoin(planningInstruments, eq(planningInstruments.id, planningLines.instrumentId)).leftJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningInstruments.annualBudgetLawId)).where(eq(planningLines.appropriationId, appropriationId)).limit(1);
  if (!row) return null;
  const quotas = await db.select().from(planningQuotas).where(eq(planningQuotas.lineId, row.line.id)).orderBy(asc(planningQuotas.month));
  return { ...row.line, instrument: { ...row.instrument, annualBudgetLaw: row.annualBudgetLaw }, quotas };
}

export async function readPlanningRestrictions(db: DatabaseExecutor, appropriationId: string) {
  const [line] = await db.select({ id: planningLines.id }).from(planningLines).where(eq(planningLines.appropriationId, appropriationId)).limit(1);
  if (!line) return { creditReserved: new Decimal(0), contingent: new Decimal(0) };
  const credits = await db.select({ reserved: planningCreditLines.reserved }).from(planningCreditLines).innerJoin(planningCreditBatches, eq(planningCreditBatches.id, planningCreditLines.batchId)).where(and(eq(planningCreditLines.lineId, line.id), inArray(planningCreditBatches.status, ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"])));
  const quotas = await db.select({ blocked: planningQuotas.blocked }).from(planningQuotas).where(eq(planningQuotas.lineId, line.id));
  return { creditReserved: credits.reduce((sum, row) => sum.plus(row.reserved), new Decimal(0)), contingent: quotas.reduce((sum, row) => sum.plus(row.blocked), new Decimal(0)) };
}

export async function findConnectedRevenuePiece(db: DatabaseExecutor, budgetUnitId: string, year: number) {
  const pieces = await db.select({ instrumentId: planningInstruments.id }).from(planningInstruments).innerJoin(planningEntityUnits, eq(planningEntityUnits.governmentEntityId, planningInstruments.governmentEntityId)).innerJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningInstruments.annualBudgetLawId)).where(and(eq(planningInstruments.kind, "LOA"), eq(planningInstruments.startYear, year), eq(planningEntityUnits.budgetUnitId, budgetUnitId), sql`${planningInstruments.implantedAt} IS NOT NULL`, sql`${planningBudgetLaws.metadata}->'planningInternalExecution' = 'true'::jsonb`));
  if (pieces.length > 1) throw new Error("Orçamento de arrecadação ambíguo; reconcilie a implantação por entidade/exercício.");
  return pieces[0] ? { instrumentId: pieces[0].instrumentId, budgetUnitId } : null;
}
