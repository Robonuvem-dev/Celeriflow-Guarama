import type { PlanningContext } from "./access";
import { assertPlanningOperation, planningInstrumentWhere, planningLineWhere } from "./access";
import { canViewModule } from "@/lib/platform/tenant-context";
import { Prisma } from "@prisma/client";
import { planningDateSchema } from "./revisions";

/** Source-quota competence, net of linked reversals; cash is the gross paid expense, not bank net. */
export async function readPlanningMonthlyExecution(context: PlanningContext, instrumentId: string, year: number, asOf: string, requestedPage = 1) {
  assertPlanningOperation(context, "issueReports");
  planningDateSchema.parse(asOf);
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, page: 1, total: 0, rows: [] };
  const piece = await context.prisma.planningInstrument.findFirstOrThrow({ where: { id: instrumentId, ...planningInstrumentWhere(context) }, include: { annualBudgetLaw: true } });
  if (piece.kind !== "LOA" || year !== piece.startYear) throw new Error("Selecione a LOA do exercício de execução.");
  const metadata = piece.annualBudgetLaw?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.planningInternalExecution !== true) return { status: "NOT_CONNECTED" as const, page: 1, total: 0, rows: [] };
  const where = { instrumentId, year, kind: { in: ["EXPENSE", "REVENUE"] as ("EXPENSE" | "REVENUE")[] }, ...planningLineWhere(context) };
  const total = await context.prisma.planningBudgetLine.count({ where });
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const lines = await context.prisma.planningBudgetLine.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ code: "asc" }, { id: "asc" }], include: { quotas: { include: { events: { where: { effectiveAt: { lte: new Date(`${asOf}T23:59:59.999Z`) }, submissionKey: { startsWith: "finance:" } } } } } } });
  const rows = lines.flatMap((line) => Array.from({ length: 12 }, (_, index) => {
    const quota = line.quotas.find((row) => row.month === index + 1);
    const sum = (types: string[]) => (quota?.events ?? []).filter((event) => types.includes(event.type)).reduce((value, event) => value.plus(event.value), new Prisma.Decimal(0));
    return { lineId: line.id, year, month: index + 1, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, stage: line.kind === "REVENUE" ? "ARRECADADA" : "EMPENHADA", competence: "SOURCE_QUOTA_MONTH", status: quota ? "CONNECTED" : "MISSING_QUOTA", realized: quota ? sum(["CONSUME", "REVENUE_SOURCE_IN"]).minus(sum(["REVERSE", "REVENUE_SOURCE_OUT"])).toFixed(2) : null, paidGross: quota && line.kind === "EXPENSE" ? sum(["PAY"]).minus(sum(["REVERSE_PAYMENT"])).toFixed(2) : null, sourceEventIds: quota?.events.map((event) => event.id) ?? [] };
  }));
  return { status: rows.some((row) => row.status === "MISSING_QUOTA") ? "INCOMPLETE" as const : "CONNECTED" as const, page, total, rows };
}
