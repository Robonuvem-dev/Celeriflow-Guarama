import "server-only";
import { Prisma } from "@prisma/client";
import { AccessError } from "@/lib/platform/tenant-context";
import { planningInstrumentWhere, planningLineWhere, type PlanningContext } from "./access";

/** Read contract for Finance/Procurement adapters in F9, including future-year reservations. */
export async function getImplantedPlanningBudget(context: PlanningContext, instrumentId: string, pageInput = "1") {
  const piece = await context.prisma.planningInstrument.findFirst({ where: { id: instrumentId, ...planningInstrumentWhere(context), implantedAt: { not: null } }, include: { annualBudgetLaw: { include: { financialYear: true } } } });
  if (!piece?.annualBudgetLaw) throw new AccessError("LOA implantada não encontrada neste escopo.", 404);
  const where = { ...planningLineWhere(context), instrumentId, kind: "EXPENSE" as const, appropriationId: { not: null } };
  const total = await context.prisma.planningBudgetLine.count({ where });
  const requested = Number(pageInput);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const lines = await context.prisma.planningBudgetLine.findMany({
    where,
    include: {
      appropriation: { include: { reservations: { where: { status: "Ativa" } } } },
      quotas: true,
      creditLines: { where: { batch: { status: { in: ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"] } } } },
    },
    take: 20, skip: (page - 1) * 20, orderBy: [{ code: "asc" }, { id: "asc" }],
  });
  const pending = await context.prisma.planningIntegrationCommand.count({ where: { status: { not: "DELIVERED" }, OR: [{ idempotencyKey: `implant:${piece.id}` }, { payload: { path: ["instrumentId"], equals: piece.id } }] } });
  const year = piece.annualBudgetLaw.financialYear;
  return { instrumentId, year: year.year, revision: piece.revision, page, total,
    capabilities: { futureReservation: ["Preparação", "Aberto"].includes(year.status), commitment: year.status === "Aberto" && pending === 0, accountingPending: pending > 0 },
    records: lines.map((line) => {
      const appropriation = line.appropriation!;
      const updated = appropriation.updatedValueDecimal ?? new Prisma.Decimal(appropriation.updatedValue);
      const committed = appropriation.committedValueDecimal ?? new Prisma.Decimal(appropriation.committedValue);
      const reservations = appropriation.reservations.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Prisma.Decimal(row.value)), new Prisma.Decimal(0));
      const creditReserved = line.creditLines.reduce((sum, row) => sum.plus(row.reserved), new Prisma.Decimal(0));
      const blocked = line.quotas.reduce((sum, row) => sum.plus(row.blocked), new Prisma.Decimal(0));
      const budgetAvailable = updated.minus(committed).minus(reservations).minus(creditReserved).minus(blocked);
      const quotaAvailable = line.quotas.filter((row) => !row.closedAt).reduce((sum, row) => sum.plus(row.planned.minus(row.consumed).minus(row.blocked)), new Prisma.Decimal(0)).minus(reservations).minus(creditReserved);
      return { lineId: line.id, appropriationId: appropriation.id, code: line.code, reducedCode: line.reducedCode, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, updated: updated.toFixed(2), committed: committed.toFixed(2), purchaseReserved: reservations.toFixed(2), creditReserved: creditReserved.toFixed(2), contingent: blocked.toFixed(2), available: Prisma.Decimal.max(0, line.quotas.length ? Prisma.Decimal.min(budgetAvailable, quotaAvailable) : budgetAvailable).toFixed(2) };
    }),
  };
}
