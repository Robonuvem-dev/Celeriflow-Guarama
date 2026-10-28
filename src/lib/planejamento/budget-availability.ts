import "server-only";
import { and, asc, count, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { planningAppropriations, planningCreditBatches, planningCreditLines, planningLines, planningQuotas } from "@/db/schema/planning-budget";
import { planningIntegrationCommands } from "@/db/schema/planning-legal";
import { planningReservations } from "@/db/schema/planning-financial-sources";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { planningDatabase } from "./database";
import { AccessError } from "@/lib/platform/tenant-context";
import type { PlanningContext } from "./access";

/** Read contract for Finance/Procurement adapters in F9, including future-year reservations. */
export async function getImplantedPlanningBudget(context: PlanningContext, instrumentId: string, pageInput = "1") {
  const db = planningDatabase(context);
  const piece = await readPlanningInstrument(db, instrumentId, context);
  if (!piece?.implantedAt || !piece.annualBudgetLaw) throw new AccessError("LOA implantada não encontrada neste escopo.", 404);
  const where = and(planningLineScope(context), eq(planningLines.instrumentId, instrumentId), eq(planningLines.kind, "EXPENSE"), isNotNull(planningLines.appropriationId));
  const [{ total }] = await db.select({ total: count() }).from(planningLines).where(where);
  const requested = Number(pageInput);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.select({ line: planningLines, appropriation: planningAppropriations }).from(planningLines).innerJoin(planningAppropriations, eq(planningAppropriations.id, planningLines.appropriationId)).where(where).limit(20).offset((page - 1) * 20).orderBy(asc(planningLines.code), asc(planningLines.id));
  const lines = await Promise.all(rows.map(async ({ line, appropriation }) => {
    const [reservations, quotas, creditLines] = await Promise.all([
      db.select().from(planningReservations).where(and(eq(planningReservations.appropriationId, appropriation.id), eq(planningReservations.status, "Ativa"))),
      db.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id)),
      db.select({ reserved: planningCreditLines.reserved }).from(planningCreditLines).innerJoin(planningCreditBatches, eq(planningCreditBatches.id, planningCreditLines.batchId)).where(and(eq(planningCreditLines.lineId, line.id), inArray(planningCreditBatches.status, ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"]))),
    ]);
    return { ...line, appropriation: { ...appropriation, reservations }, quotas, creditLines };
  }));
  const [{ pending }] = await db.select({ pending: count() }).from(planningIntegrationCommands).where(and(ne(planningIntegrationCommands.status, "DELIVERED"), or(eq(planningIntegrationCommands.idempotencyKey, `implant:${piece.id}`), sql`${planningIntegrationCommands.payload}->>'instrumentId' = ${piece.id}`)));
  const year = piece.annualBudgetLaw.financialYear;
  return { instrumentId, year: year.year, revision: piece.revision, page, total,
    capabilities: { futureReservation: ["Preparação", "Aberto"].includes(year.status), commitment: year.status === "Aberto" && pending === 0, accountingPending: pending > 0 },
    records: lines.map((line) => {
      const appropriation = line.appropriation!;
      const updated = appropriation.updatedValueDecimal ?? new Decimal(appropriation.updatedValue);
      const committed = appropriation.committedValueDecimal ?? new Decimal(appropriation.committedValue);
      const reservations = appropriation.reservations.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Decimal(row.value)), new Decimal(0));
      const creditReserved = line.creditLines.reduce((sum, row) => sum.plus(row.reserved), new Decimal(0));
      const blocked = line.quotas.reduce((sum, row) => sum.plus(row.blocked), new Decimal(0));
      const budgetAvailable = updated.minus(committed).minus(reservations).minus(creditReserved).minus(blocked);
      const quotaAvailable = line.quotas.filter((row) => !row.closedAt).reduce((sum, row) => sum.plus(row.planned.minus(row.consumed).minus(row.blocked)), new Decimal(0)).minus(reservations).minus(creditReserved);
      return { lineId: line.id, appropriationId: appropriation.id, code: line.code, reducedCode: line.reducedCode, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, updated: updated.toFixed(2), committed: committed.toFixed(2), purchaseReserved: reservations.toFixed(2), creditReserved: creditReserved.toFixed(2), contingent: blocked.toFixed(2), available: Decimal.max(0, line.quotas.length ? Decimal.min(budgetAvailable, quotaAvailable) : budgetAvailable).toFixed(2) };
    }),
  };
}
