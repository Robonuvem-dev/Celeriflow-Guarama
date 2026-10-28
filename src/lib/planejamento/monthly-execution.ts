import type { PlanningContext } from "./access";
import { assertPlanningOperation } from "./access";
import { canViewModule } from "@/lib/platform/tenant-context";
import { and, asc, count, eq, inArray, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { planningLines, planningQuotaEvents, planningQuotas } from "@/db/schema/planning-budget";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { planningDatabase } from "./database";
import { planningDateSchema } from "./revisions";

/** Source-quota competence, net of linked reversals; cash is the gross paid expense, not bank net. */
export async function readPlanningMonthlyExecution(context: PlanningContext, instrumentId: string, year: number, asOf: string, requestedPage = 1) {
  assertPlanningOperation(context, "issueReports");
  planningDateSchema.parse(asOf);
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, page: 1, total: 0, rows: [] };
  const db = planningDatabase(context);
  const piece = await readPlanningInstrument(db, instrumentId, context);
  if (!piece) throw new Error("Peça não encontrada neste escopo.");
  if (piece.kind !== "LOA" || year !== piece.startYear) throw new Error("Selecione a LOA do exercício de execução.");
  const metadata = piece.annualBudgetLaw?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.planningInternalExecution !== true) return { status: "NOT_CONNECTED" as const, page: 1, total: 0, rows: [] };
  const where = and(eq(planningLines.instrumentId, instrumentId), eq(planningLines.year, year), inArray(planningLines.kind, ["EXPENSE", "REVENUE"]), planningLineScope(context));
  const [{ total }] = await db.select({ total: count() }).from(planningLines).where(where);
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const selected = await db.select().from(planningLines).where(where).limit(20).offset((page - 1) * 20).orderBy(asc(planningLines.code), asc(planningLines.id));
  const lines = await Promise.all(selected.map(async line => {
    const quotas = await db.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id));
    return { ...line, quotas: await Promise.all(quotas.map(async quota => ({ ...quota, events: await db.select().from(planningQuotaEvents).where(and(eq(planningQuotaEvents.quotaId, quota.id), lte(planningQuotaEvents.effectiveAt, new Date(`${asOf}T23:59:59.999Z`)), sql`starts_with(${planningQuotaEvents.submissionKey}, 'finance:')`)) }))) };
  }));
  const rows = lines.flatMap((line) => Array.from({ length: 12 }, (_, index) => {
    const quota = line.quotas.find((row) => row.month === index + 1);
    const sum = (types: string[]) => (quota?.events ?? []).filter((event) => types.includes(event.type)).reduce((value, event) => value.plus(event.value), new Decimal(0));
    return { lineId: line.id, year, month: index + 1, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, stage: line.kind === "REVENUE" ? "ARRECADADA" : "EMPENHADA", competence: "SOURCE_QUOTA_MONTH", status: quota ? "CONNECTED" : "MISSING_QUOTA", realized: quota ? sum(["CONSUME", "REVENUE_SOURCE_IN"]).minus(sum(["REVERSE", "REVENUE_SOURCE_OUT"])).toFixed(2) : null, paidGross: quota && line.kind === "EXPENSE" ? sum(["PAY"]).minus(sum(["REVERSE_PAYMENT"])).toFixed(2) : null, sourceEventIds: quota?.events.map((event) => event.id) ?? [] };
  }));
  return { status: rows.some((row) => row.status === "MISSING_QUOTA") ? "INCOMPLETE" as const : "CONNECTED" as const, page, total, rows };
}
