import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;
type Actor = { usuarioId: string; employeeId: string | null };
const enabled = (metadata: Prisma.JsonValue | null) => !!metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.planningInternalExecution === true;

async function hasPlanningRuntime(db: Db) {
  const [row] = await db.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('"PlanningBudgetLine"') IS NOT NULL AND to_regclass('"PlanningQuotaEvent"') IS NOT NULL AND to_regclass('"PlanningCreditLine"') IS NOT NULL) AS ready`;
  return row?.ready === true;
}

/** Shared lock order: instrument before appropriation, including Finance/Procurement callers. */
export async function lockPlanningBudgetForAppropriation(tx: Tx, appropriationId: string) {
  if (!await hasPlanningRuntime(tx)) return;
  await tx.$queryRaw`SELECT p.id FROM "PlanningInstrument" p JOIN "PlanningBudgetLine" l ON l."instrumentId" = p.id WHERE l."appropriationId" = ${appropriationId} FOR UPDATE OF p`;
}

export async function getPlanningBudgetRestrictions(db: Db, appropriationId: string) {
  if (!await hasPlanningRuntime(db)) return { creditReserved: new Prisma.Decimal(0), contingent: new Prisma.Decimal(0) };
  const line = await db.planningBudgetLine.findUnique({ where: { appropriationId }, include: { creditLines: { where: { batch: { status: { in: ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"] } } } }, quotas: true } });
  return { creditReserved: line?.creditLines.reduce((sum, row) => sum.plus(row.reserved), new Prisma.Decimal(0)) ?? new Prisma.Decimal(0), contingent: line?.quotas.reduce((sum, row) => sum.plus(row.blocked), new Prisma.Decimal(0)) ?? new Prisma.Decimal(0) };
}

async function adoptedLine(db: Db, appropriationId: string) {
  if (!await hasPlanningRuntime(db)) return null;
  const line = await db.planningBudgetLine.findUnique({ where: { appropriationId }, include: { instrument: { include: { annualBudgetLaw: true } }, quotas: { orderBy: { month: "asc" } } } });
  if (line?.instrument.implantedAt && !enabled(line.instrument.annualBudgetLaw?.metadata ?? null)) throw new Error("Conecte a execução da LOA no Planejamento antes de reservar ou executar esta dotação.");
  return line && enabled(line.instrument.annualBudgetLaw?.metadata ?? null) ? line : null;
}

/** Future procurement reservations are permitted only against implanted, traced budgets. */
export async function assertPlanningReservationYear(db: Db, appropriationId: string, financialYearId: string, date: Date) {
  const line = await adoptedLine(db, appropriationId);
  const year = await db.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  if (!line || !line.instrument.implantedAt || line.instrument.annualBudgetLaw?.financialYearId !== year.id || line.year !== year.year || !["Preparação", "Aberto"].includes(year.status) || date.getUTCFullYear() !== year.year || date < year.startDate || date > year.endDate) throw new Error("Reserva futura exige orçamento implantado, conectado e data dentro do exercício de destino.");
  return year;
}

export async function assertPlanningPeriodAvailability(tx: Tx, appropriationId: string, date: Date, value: Prisma.Decimal, excludeReservationId?: string) {
  const line = await adoptedLine(tx, appropriationId);
  if (!line) return false;
  if (date.getUTCFullYear() !== line.year || !value.isFinite() || !value.greaterThan(0)) throw new Error("Data ou valor incompatível com a cota do exercício.");
  const quota = line.quotas.find((row) => row.month === date.getUTCMonth() + 1);
  if (!quota || line.quotas.length !== 12 || quota.closedAt) throw new Error("Cadastre os doze meses e utilize um período de cota aberto.");
  const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
  const period = line.quotas.filter((row) => row.month >= first && row.month < first + quota.periodMonths && !row.closedAt);
  const start = new Date(Date.UTC(line.year, first - 1, 1)), end = new Date(Date.UTC(line.year, first - 1 + quota.periodMonths, 1));
  const reservations = await tx.budgetReservation.findMany({ where: { appropriationId, status: "Ativa", date: { gte: start, lt: end }, ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}) }, select: { valueDecimal: true } });
  const reserved = reservations.reduce((sum, row) => { if (row.valueDecimal === null) throw new Error("Reconcilie o valor Decimal das reservas antes de executar a cota."); return sum.plus(row.valueDecimal); }, new Prisma.Decimal(0));
  const available = period.reduce((sum, row) => sum.plus(row.planned).minus(row.consumed).minus(row.blocked), new Prisma.Decimal(0)).minus(reserved);
  if (value.greaterThan(available)) throw new Error("O lançamento excede a cota do período de Planejamento, considerando reservas e contingenciamento.");
  return true;
}

export async function recordPlanningFinanceExecution(tx: Tx, actor: Actor, input: { appropriationId: string; operation: "CONSUME" | "REVERSE" | "PAY" | "REVERSE_PAYMENT"; date: Date; value: Prisma.Decimal; key: string; originPrefix?: string }) {
  await lockPlanningBudgetForAppropriation(tx, input.appropriationId);
  const line = await adoptedLine(tx, input.appropriationId);
  if (!line) return;
  if (!input.value.isFinite() || !input.value.greaterThan(0)) throw new Error("Execução financeira exige valor positivo.");
  const duplicate = await tx.planningQuotaEvent.findUnique({ where: { submissionKey: input.key }, include: { quota: { select: { lineId: true } } } });
  if (duplicate) {
    if (duplicate.quota.lineId !== line.id || duplicate.type !== input.operation || !duplicate.value.equals(input.value) || duplicate.effectiveAt.getTime() !== input.date.getTime()) throw new Error("Execução já registrada com outros dados.");
    return;
  }
  if (input.date.getUTCFullYear() !== line.year) throw new Error("Execução financeira fora do exercício da cota.");
  if (["REVERSE", "REVERSE_PAYMENT"].includes(input.operation)) {
    const replay = await tx.planningQuotaEvent.findMany({ where: { submissionKey: { startsWith: `${input.key}:` }, quota: { lineId: line.id } } });
    if (replay.length) {
      if (replay.some((event) => event.type !== input.operation || event.effectiveAt.getTime() !== input.date.getTime()) || !replay.reduce((sum, event) => sum.plus(event.value), new Prisma.Decimal(0)).equals(input.value)) throw new Error("Estorno já registrado com outros dados.");
      return;
    }
    const origins = await tx.planningQuotaEvent.findMany({ where: { quota: { lineId: line.id }, type: input.operation === "REVERSE" ? "CONSUME" : "PAY", submissionKey: { startsWith: input.originPrefix ?? input.key } }, include: { releases: true }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }] });
    let remaining = input.value;
    for (const origin of origins) {
      const available = origin.value.minus(origin.releases.reduce((sum, row) => sum.plus(row.value), new Prisma.Decimal(0)));
      const value = Prisma.Decimal.min(remaining, available);
      if (!value.greaterThan(0)) continue;
      if (input.date < origin.effectiveAt) throw new Error("Estorno não pode anteceder a execução original.");
      await tx.planningQuota.update({ where: { id: origin.quotaId }, data: input.operation === "REVERSE" ? { consumed: { decrement: value } } : { disbursementPaid: { decrement: value } } });
      await tx.planningQuotaEvent.create({ data: { quotaId: origin.quotaId, type: input.operation, value, effectiveAt: input.date, reason: "Estorno financeiro canônico", submissionKey: `${input.key}:${origin.id}`, originEventId: origin.id, createdById: actor.usuarioId } });
      remaining = remaining.minus(value);
    }
    if (remaining.greaterThan(0)) throw new Error("O estorno excede a execução financeira vinculada às cotas.");
    return;
  }
  const quota = line.quotas.find((row) => row.month === input.date.getUTCMonth() + 1);
  if (!quota || quota.closedAt) throw new Error("A execução exige cota mensal aberta.");
  if (input.operation === "PAY") {
    if (quota.disbursementPaid.plus(input.value).greaterThan(quota.disbursementPlanned)) throw new Error("O pagamento excede o cronograma mensal de desembolso.");
    await tx.planningQuota.update({ where: { id: quota.id }, data: { disbursementPaid: { increment: input.value } } });
  } else {
    let remaining = input.value.minus(quota.planned.minus(quota.consumed).minus(quota.blocked));
    const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
    for (const peer of line.quotas.filter((row) => row.id !== quota.id && !row.closedAt && row.month >= first && row.month < first + quota.periodMonths)) {
      if (!remaining.greaterThan(0)) break;
      const moved = Prisma.Decimal.min(remaining, peer.planned.minus(peer.consumed).minus(peer.blocked));
      if (!moved.greaterThan(0)) continue;
      await tx.planningQuota.update({ where: { id: peer.id }, data: { planned: { decrement: moved } } });
      await tx.planningQuota.update({ where: { id: quota.id }, data: { planned: { increment: moved } } });
      for (const [id, type, signed] of [[peer.id, "PERIOD_TRANSFER_OUT", moved.negated()], [quota.id, "PERIOD_TRANSFER_IN", moved]] as const) await tx.planningQuotaEvent.create({ data: { quotaId: id, type, value: signed, effectiveAt: input.date, reason: "Consumo financeiro no período configurado", submissionKey: `${input.key}:${type}:${peer.id}`, createdById: actor.usuarioId } });
      remaining = remaining.minus(moved);
    }
    if (remaining.greaterThan(0)) throw new Error("Cotas insuficientes para a execução financeira.");
    await tx.planningQuota.update({ where: { id: quota.id }, data: { consumed: { increment: input.value } } });
  }
  await tx.planningQuotaEvent.create({ data: { quotaId: quota.id, type: input.operation, value: input.value, effectiveAt: input.date, reason: input.operation === "PAY" ? "Despesa paga bruta — Financeiro" : "Empenhamento canônico — Financeiro", submissionKey: input.key, createdById: actor.usuarioId } });
}

export async function readPlanningFinancialExecution(context: AppContext, references: { id: string; year: number; budgetUnitId: string; resourceSourceId: string; kind: string; appropriationId?: string | null; revenueNature?: { id: string } | null }[], asOf: Date) {
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, rows: [] };
  const [runtime] = await context.prisma.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('"Commitment"') IS NOT NULL AND to_regclass('"CommitmentMovement"') IS NOT NULL AND to_regclass('"TreasuryMovement"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`;
  if (!runtime.ready) return { status: "UNAVAILABLE" as const, rows: [] };
  type ExecutionRow = { lineId: string; status: "CONNECTED" | "UNMAPPED" | "AMBIGUOUS" | "UNRECONCILED"; committed: string | null; collected: string | null; paidNet: string | null; paidGross: string | null; appropriationId: string | null };
  const rows: ExecutionRow[] = [];
  const mapped = new Map<string, ExecutionRow>();
  for (const line of references) {
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) throw new Error("Execução financeira fora das unidades autorizadas.");
    const source = await context.prisma.planningBudgetLine.findUnique({ where: { id: line.id }, include: { instrument: { include: { parent: { include: { parent: true } } } } } });
    if (!source || source.year !== line.year || source.kind !== line.kind || source.budgetUnitId !== line.budgetUnitId || source.resourceSourceId !== line.resourceSourceId) throw new Error("Referência de execução fora da classificação autorizada.");
    const from = new Date(Date.UTC(line.year, 0, 1)), until = new Date(Math.min(asOf.getTime(), Date.UTC(line.year + 1, 0, 1) - 1));
    let committed = new Prisma.Decimal(0), collected = new Prisma.Decimal(0), paid = new Prisma.Decimal(0), paidGross = new Prisma.Decimal(0);
    let appropriationId = source.appropriationId;
    if (line.kind === "EXPENSE" && !appropriationId) {
      const root = source.instrument.multiYearPlanId ?? source.instrument.parent?.multiYearPlanId ?? source.instrument.parent?.parent?.multiYearPlanId;
      const matches = await context.prisma.planningBudgetLine.findMany({ where: { kind: "EXPENSE", year: source.year, budgetUnitId: source.budgetUnitId, resourceSourceId: source.resourceSourceId, programId: source.programId, actionId: source.actionId, expenseNatureId: source.expenseNatureId, functionCode: source.functionCode, subfunctionCode: source.subfunctionCode, product: source.product, productUnit: source.productUnit, appropriationId: { not: null }, instrument: { kind: "LOA", governmentEntityId: source.instrument.governmentEntityId, implantedAt: { not: null }, annualBudgetLaw: { is: { budgetGuideline: { is: { multiYearPlanId: root ?? "" } } } } } }, select: { code: true, appropriationId: true } });
      const sameCode = matches.filter((candidate) => candidate.code === source.code);
      const candidates = sameCode.length ? sameCode : matches;
      if (candidates.length !== 1) { rows.push({ lineId: line.id, status: candidates.length ? "AMBIGUOUS" : "UNMAPPED", committed: null, collected: null, paidNet: null, paidGross: null, appropriationId: null }); continue; }
      appropriationId = candidates[0].appropriationId;
    }
    if (line.kind === "EXPENSE" && appropriationId) {
      const commitments = await context.prisma.commitment.findMany({ where: { appropriationId, date: { gte: from, lte: until } }, select: { valueDecimal: true, movements: { where: { date: { lte: until } }, select: { type: true, valueDecimal: true } } } });
      if (commitments.some((row) => row.valueDecimal === null || row.movements.some((movement) => !["Reforço", "Anulação"].includes(movement.type)))) { rows.push({ lineId: line.id, status: "UNRECONCILED", committed: null, collected: null, paidNet: null, paidGross: null, appropriationId }); continue; }
      committed = commitments.reduce((sum, row) => sum.plus(row.movements.reduce((value, movement) => movement.type === "Reforço" ? value.plus(movement.valueDecimal) : value.minus(movement.valueDecimal), row.valueDecimal!)), new Prisma.Decimal(0));
      const payments = await context.prisma.payment.findMany({ where: { commitment: { appropriationId } }, select: { id: true, valueDecimal: true } });
      const cash = await context.prisma.treasuryMovement.findMany({ where: { status: "Confirmado", date: { gte: from, lte: until }, sourceType: "PAYMENT", sourceId: { in: payments.map((payment) => payment.id) } }, select: { type: true, valueDecimal: true, sourceId: true } });
      const amounts = new Map(payments.map((payment) => [payment.id, payment.valueDecimal]));
      if (cash.some((movement) => !amounts.get(movement.sourceId ?? ""))) { rows.push({ lineId: line.id, status: "UNRECONCILED", committed: committed.toFixed(2), collected: null, paidNet: null, paidGross: null, appropriationId }); continue; }
      paidGross = cash.reduce((sum, row) => row.type === "PaymentReversal" ? sum.minus(amounts.get(row.sourceId!)!) : row.type === "Payment" ? sum.plus(amounts.get(row.sourceId!)!) : sum, new Prisma.Decimal(0));
      paid = cash.reduce((sum, row) => row.type === "PaymentReversal" ? sum.minus(row.valueDecimal) : row.type === "Payment" ? sum.plus(row.valueDecimal) : sum, new Prisma.Decimal(0));
    } else if (line.kind === "REVENUE" && source.revenueNatureId) {
      const revenueWhere = { revenueNatureId: source.revenueNatureId, resourceSourceId: line.resourceSourceId, bankAccount: { is: { budgetUnitId: line.budgetUnitId } } };
      const receipts = await context.prisma.treasuryMovement.findMany({ where: { status: "Confirmado", date: { gte: from, lte: until }, OR: [{ revenue: { is: revenueWhere } }, { revenueReversal: { is: { revenue: revenueWhere } } }] }, select: { type: true, valueDecimal: true } });
      collected = receipts.reduce((sum, row) => row.type === "RevenueReversal" ? sum.minus(row.valueDecimal) : row.type === "Revenue" ? sum.plus(row.valueDecimal) : sum, new Prisma.Decimal(0));
      const adjustments = await context.prisma.revenueResourceRedistribution.findMany({ where: { date: { gte: from, lte: until }, revenue: { revenueNatureId: source.revenueNatureId, bankAccount: { is: { budgetUnitId: line.budgetUnitId } } }, OR: [{ sourceResourceSourceId: line.resourceSourceId }, { destinationResourceSourceId: line.resourceSourceId }] }, select: { sourceResourceSourceId: true, valueDecimal: true } });
      collected = adjustments.reduce((sum, adjustment) => adjustment.sourceResourceSourceId === line.resourceSourceId ? sum.minus(adjustment.valueDecimal) : sum.plus(adjustment.valueDecimal), collected);
    }
    const row: ExecutionRow = { lineId: line.id, status: "CONNECTED", committed: committed.toFixed(2), collected: collected.toFixed(2), paidNet: paid.toFixed(2), paidGross: paidGross.toFixed(2), appropriationId };
    const key = appropriationId ?? `${source.year}:${source.budgetUnitId}:${source.resourceSourceId}:${source.revenueNatureId}`;
    const prior = mapped.get(key);
    if (prior) { prior.status = row.status = "AMBIGUOUS"; prior.committed = row.committed = null; prior.collected = row.collected = null; prior.paidNet = row.paidNet = null; prior.paidGross = row.paidGross = null; }
    mapped.set(key, row);
    rows.push(row);
  }
  return { status: "CONNECTED" as const, rows };
}
