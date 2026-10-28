import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, ne, notInArray, sql, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningCreditBatches, planningCreditLines, planningLines, planningQuotas, planningQuotaEvents } from "@/db/schema/planning-budget";
import { planningActions, planningPrograms } from "@/db/schema/planning-legal";
import { planningReservations } from "@/db/schema/planning-financial-sources";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningLineScope } from "@/db/repositories/planning/scope";
import { readScheduleHistory } from "@/db/repositories/planning-execution-operations/scheduling";
import { z } from "zod";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { planningConnection } from "./database";
import { contentHash, jsonValue, linePosition, lockLegalInstrument, planningAudit } from "./operations-core";
import { moneySchema } from "./policy";
import { planningDateSchema } from "./revisions";

/** Largest remainder distributes exact cents, with month order as stable tie breaker. */
export function distributePlanningMonths(total: string, weights: string[]) {
  moneySchema.parse(total);
  if (weights.length !== 12) throw new Error("Informe os doze meses.");
  const values = weights.map((weight) => { const value = new Decimal(weight); if (!value.isFinite() || value.isNegative()) throw new Error("Peso mensal inválido."); return value; });
  const sum = values.reduce((value, row) => value.plus(row), new Decimal("0"));
  if (!sum.greaterThan(0)) throw new Error("A base mensal deve ser maior que zero.");
  const cents = new Decimal(total).mul(100);
  const rows = values.map((weight, month) => { const raw = cents.mul(weight).div(sum); return { month, cents: raw.floor(), remainder: raw.minus(raw.floor()) }; });
  const remaining = cents.minus(rows.reduce((value, row) => value.plus(row.cents), new Decimal("0"))).toNumber();
  for (const row of [...rows].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.month - b.month).slice(0, remaining)) row.cents = row.cents.plus(1);
  return rows.map((row) => row.cents.div(100));
}

export async function generatePlanningSchedule(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
   const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), method: z.enum(["TWELFTHS", "PERCENTAGES", "PREVIOUS_YEAR", "THREE_YEARS"]), periodMonths: z.coerce.number().refine((value) => [2, 3, 6].includes(value)), percentages: z.string().optional(), effectiveAt: planningDateSchema.optional(), reason: z.string().trim().min(1) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    if (piece.kind !== "LOA") throw new Error("Programação mensal exige LOA.");
    const [found] = await tx.select({ line: planningLines, action: planningActions, program: planningPrograms }).from(planningLines).leftJoin(planningActions, eq(planningActions.id, planningLines.actionId)).leftJoin(planningPrograms, eq(planningPrograms.id, planningLines.programId)).where(and(planningLineScope(context), eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, piece.id), inArray(planningLines.kind, ["REVENUE", "EXPENSE"]))).limit(1);
    if (!found) throw new Error("Previsão não encontrada nas unidades autorizadas.");
    const line = { ...found.line, action: found.action, program: found.program };
    if ((await tx.select({ id: planningQuotas.id }).from(planningQuotas).where(eq(planningQuotas.lineId, line.id)).limit(1)).length) throw new Error("Programação já existente. Utilize revisão legal ou redistribuição para preservar o histórico.");
    let weights = Array<string>(12).fill("1");
    const historical: { year: number; values: string[] }[] = [];
    if (input.method === "PERCENTAGES") {
      weights = (input.percentages ?? "").split(/[;\s]+/).filter(Boolean);
      if (weights.length !== 12 || weights.some((row) => !/^\d{1,3}(\.\d{1,6})?$/.test(row)) || !weights.reduce((sum, value) => sum.plus(value), new Decimal("0")).equals(100)) throw new Error("Informe doze percentuais não negativos que totalizem 100%, separados por ponto e vírgula.");
    }
    if (["PREVIOUS_YEAR", "THREE_YEARS"].includes(input.method)) {
      const years = input.method === "PREVIOUS_YEAR" ? [line.year - 1] : [line.year - 1, line.year - 2, line.year - 3];
      weights = Array<string>(12).fill("0");
      for (const year of years) {
        const history = await readScheduleHistory(tx, line, piece.governmentEntityId, year);
        if (new Set(history.map((row) => row.month)).size !== 12) throw new Error(`Histórico mensal incompleto em ${year}. Registre os realizados de origem antes de calcular.`);
        const values = Array.from({ length: 12 }, (_, month) => history.filter((row) => row.month === month + 1).reduce((sum, row) => sum.plus(row.consumed), new Decimal("0")).toFixed(2));
        historical.push({ year, values });
        weights = weights.map((value, month) => new Decimal(value).plus(values[month]).toString());
      }
    }
    const total = await linePosition(tx, line.id);
    const monthly = distributePlanningMonths(total.toFixed(2), weights);
    const generatedAt = input.effectiveAt ?? new Date().toISOString().slice(0, 10);
    if (generatedAt > new Date().toISOString().slice(0, 10)) throw new Error("A vigência da programação ainda não pode ser futura.");
    for (const [index, planned] of monthly.entries()) await tx.insert(planningQuotas).values({ lineId: line.id, kind: line.kind, month: index + 1, planned, disbursementPlanned: line.kind === "EXPENSE" ? planned : new Decimal("0"), periodMonths: input.periodMonths, method: input.method, calculation: jsonValue({ generatedAt, total: total.toFixed(2), initialPlanned: planned.toFixed(2), initialDisbursement: line.kind === "EXPENSE" ? planned.toFixed(2) : "0.00", weights, historical, reason: input.reason, stage: line.kind === "REVENUE" ? "ARRECADADA" : "EMPENHADA", disbursementStage: "PAGA", rounding: "LARGEST_REMAINDER" }) });
    await planningAudit(tx, context, piece.id, "PLANNING_SCHEDULE", { ...input, total: total.toFixed(2), monthly: monthly.map((value) => value.toFixed(2)) });
    return line.id;
  });
}

const quotaEventInput = z.object({ instrumentId: z.string().min(1), quotaId: z.string().min(1), operation: z.enum(["CONSUME", "REVERSE", "BLOCK", "RELEASE", "CLOSE", "PAY", "REVERSE_PAYMENT", "SET_DISBURSEMENT"]), effectiveAt: planningDateSchema.optional(), amount: moneySchema.default("0"), reason: z.string().trim().min(1).max(4000), originEventId: z.string().optional(), submissionKey: z.string().uuid() });
export async function planningQuotaEvent(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = quotaEventInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const [found] = await tx.select({ quota: planningQuotas, line: { kind: planningLines.kind } }).from(planningQuotas).innerJoin(planningLines, eq(planningLines.id, planningQuotas.lineId)).where(and(eq(planningQuotas.id, input.quotaId), planningLineScope(context), eq(planningLines.instrumentId, piece.id))).limit(1);
    if (!found) throw new Error("Cota não encontrada nas unidades autorizadas.");
    const quota = { ...found.quota, line: found.line };
    const metadata = piece.annualBudgetLaw?.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.planningInternalExecution === true && ["CONSUME", "REVERSE", "PAY", "REVERSE_PAYMENT"].includes(input.operation)) throw new Error("O realizado desta LOA é alimentado pelo Financeiro. Utilize a operação de origem para registrar ou estornar.");
    const value = new Decimal(input.amount);
    const effectiveAt = new Date(input.effectiveAt ?? new Date().toISOString().slice(0, 10));
    if (effectiveAt.getUTCFullYear() !== piece.startYear || effectiveAt > new Date()) throw new Error("Data do evento deve pertencer ao exercício e não pode ser futura.");
    const [duplicate] = await tx.select().from(planningQuotaEvents).where(eq(planningQuotaEvents.submissionKey, input.submissionKey)).limit(1);
    if (duplicate) { if (duplicate.quotaId !== quota.id || duplicate.type !== input.operation || !duplicate.value.equals(value) || duplicate.reason !== input.reason || duplicate.originEventId !== (input.originEventId ?? null) || input.effectiveAt && duplicate.effectiveAt.getTime() !== effectiveAt.getTime()) throw new Error("Solicitação repetida com dados diferentes."); return duplicate.id; }
    if (quota.closedAt) throw new Error("O mês já foi fechado.");
    if (["PAY", "REVERSE_PAYMENT", "SET_DISBURSEMENT", "BLOCK", "RELEASE"].includes(input.operation) && quota.line.kind !== "EXPENSE") throw new Error("Desembolso e contingenciamento exigem cota de despesa.");
    if (input.operation === "CLOSE" && !value.isZero()) throw new Error("Fechamento de mês não recebe valor financeiro.");
    if (input.operation === "CLOSE" && new Date(Date.UTC(piece.startYear, quota.month, 0)) > new Date()) throw new Error("O mês ainda não terminou.");
    if (input.operation !== "CLOSE" && !value.greaterThan(0)) throw new Error("Informe valor maior que zero.");
    const available = quota.planned.minus(quota.consumed).minus(quota.blocked);
    if (input.operation === "BLOCK" && value.greaterThan(available)) throw new Error("Valor excede a disponibilidade mensal.");
    if (input.operation === "CONSUME" && quota.line.kind === "EXPENSE" && value.greaterThan(available)) {
      const start = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
      const peers = await tx.select().from(planningQuotas).where(and(eq(planningQuotas.lineId, quota.lineId), ne(planningQuotas.id, quota.id), gte(planningQuotas.month, start), lt(planningQuotas.month, start + quota.periodMonths), isNull(planningQuotas.closedAt))).orderBy(asc(planningQuotas.month));
      let remaining = value.minus(available);
      for (const peer of peers) {
        const moved = Decimal.min(remaining, peer.planned.minus(peer.consumed).minus(peer.blocked));
        if (!moved.greaterThan(0)) continue;
        await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} - ${moved.toString()}::numeric` }).where(eq(planningQuotas.id, peer.id));
        await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} + ${moved.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
        await tx.insert(planningQuotaEvents).values({ quotaId: peer.id, type: "PERIOD_TRANSFER_OUT", effectiveAt, value: moved.negated(), reason: input.reason, submissionKey: `${input.submissionKey}:from:${peer.id}`, createdById: context.user.id });
        await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: "PERIOD_TRANSFER_IN", effectiveAt, value: moved, reason: input.reason, submissionKey: `${input.submissionKey}:to:${peer.id}`, createdById: context.user.id });
        remaining = remaining.minus(moved);
      }
      if (remaining.greaterThan(0)) throw new Error("Valor excede a disponibilidade do período configurado.");
    }
    if (input.operation === "PAY" && value.greaterThan(quota.disbursementPlanned.minus(quota.disbursementPaid))) throw new Error("Desembolso excede o cronograma mensal.");
    if (input.operation === "SET_DISBURSEMENT" && value.lessThan(quota.disbursementPaid)) throw new Error("Cronograma não pode ser inferior ao desembolso pago.");
    if (["REVERSE", "RELEASE", "REVERSE_PAYMENT"].includes(input.operation)) {
      if (!input.originEventId) throw new Error("Informe o evento original da liberação/estorno.");
      const [origin] = await tx.select().from(planningQuotaEvents).where(eq(planningQuotaEvents.id, input.originEventId)).limit(1);
      if (!origin || origin.quotaId !== quota.id || origin.type !== (input.operation === "RELEASE" ? "BLOCK" : input.operation === "REVERSE_PAYMENT" ? "PAY" : "CONSUME")) throw new Error("Evento original incompatível com a cota.");
      if (effectiveAt < origin.effectiveAt) throw new Error("Liberação/estorno não pode anteceder o evento original.");
      const releases = await tx.select({ value: planningQuotaEvents.value }).from(planningQuotaEvents).where(eq(planningQuotaEvents.originEventId, origin.id));
      const released = releases.reduce((sum, row) => sum.plus(row.value), new Decimal("0"));
      if (value.greaterThan(origin.value.minus(released))) throw new Error("Valor excede o saldo do evento original.");
    }
    await tx.update(planningQuotas).set(input.operation === "CONSUME" ? { consumed: sql`${planningQuotas.consumed} + ${value.toString()}::numeric` } : input.operation === "REVERSE" ? { consumed: sql`${planningQuotas.consumed} - ${value.toString()}::numeric` } : input.operation === "BLOCK" ? { blocked: sql`${planningQuotas.blocked} + ${value.toString()}::numeric` } : input.operation === "RELEASE" ? { blocked: sql`${planningQuotas.blocked} - ${value.toString()}::numeric` } : input.operation === "PAY" ? { disbursementPaid: sql`${planningQuotas.disbursementPaid} + ${value.toString()}::numeric` } : input.operation === "REVERSE_PAYMENT" ? { disbursementPaid: sql`${planningQuotas.disbursementPaid} - ${value.toString()}::numeric` } : input.operation === "SET_DISBURSEMENT" ? { disbursementPlanned: value } : { closedAt: new Date() }).where(eq(planningQuotas.id, quota.id));
    const [event] = await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: input.operation, effectiveAt, value, reason: input.reason, submissionKey: input.submissionKey, originEventId: input.originEventId, createdById: context.user.id }).returning({ id: planningQuotaEvents.id });
    await planningAudit(tx, context, piece.id, "PLANNING_QUOTA_EVENT", { ...input, eventId: event.id });
    return event.id;
  });
}

export async function contingencyPlanningBudget(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().optional(), percentage: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/), reason: z.string().trim().min(1), submissionKey: z.string().uuid() }).parse(raw);
  const percentage = new Decimal(input.percentage);
  if (!percentage.greaterThan(0) || percentage.greaterThan(100)) throw new Error("Percentual deve ser maior que zero e até 100%.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE"), input.lineId ? eq(planningLines.id, input.lineId) : undefined, planningLineScope(context))).orderBy(asc(planningLines.id));
    if (!lines.length) throw new Error("Nenhuma dotação autorizada selecionada.");
    if (!input.lineId && !isSystemAdministrator(context.user) && (await tx.select({ id: planningLines.id }).from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), notInArray(planningLines.budgetUnitId, context.user.allowedBudgetUnitIds), eq(planningLines.kind, "EXPENSE"))).limit(1)).length) throw new Error("Contingenciamento global exige acesso a todas as unidades.");
    const [prior] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_CONTINGENCY"), sql`${financialAuditLogs.payload}->'submissionKey' = ${JSON.stringify(input.submissionKey)}::jsonb`)).limit(1);
    if (prior) { if (contentHash(prior.payload) !== contentHash(input)) throw new Error("Solicitação repetida com dados diferentes."); return piece.id; }
    for (const line of lines) {
      const allQuotas = await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id)).orderBy(asc(planningQuotas.month));
      const quotas = allQuotas.filter((quota) => !quota.closedAt);
      if (!quotas.length) throw new Error(`Cadastre cotas abertas para ${line.code}.`);
      const amount = (await linePosition(tx, line.id)).mul(percentage).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const reservations = line.appropriationId ? await tx.select({ valueDecimal: planningReservations.valueDecimal, date: planningReservations.date }).from(planningReservations).where(and(eq(planningReservations.appropriationId, line.appropriationId), eq(planningReservations.status, "Ativa"))) : [];
      if (reservations.some((reservation) => reservation.valueDecimal === null)) throw new Error("Reconcilie as reservas antes de contingenciar.");
      const [credit] = await tx.select({ reserved: sum(planningCreditLines.reserved).mapWith(planningCreditLines.reserved) }).from(planningCreditLines).innerJoin(planningCreditBatches, eq(planningCreditBatches.id, planningCreditLines.batchId)).where(and(eq(planningCreditLines.lineId, line.id), inArray(planningCreditBatches.status, ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"])));
      const available = (await linePosition(tx, line.id)).minus(allQuotas.reduce((sum, quota) => sum.plus(quota.consumed).plus(quota.blocked), new Decimal("0"))).minus(reservations.reduce((sum, reservation) => sum.plus(reservation.valueDecimal!), new Decimal("0"))).minus(credit.reserved ?? 0);
      if (amount.greaterThan(available)) throw new Error(`Saldo insuficiente para contingenciar ${line.code}, considerando reservas de compra e crédito.`);
      const periodAvailable = new Map<number, Decimal>();
      for (const quota of quotas) {
        const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
        if (periodAvailable.has(first)) continue;
        const period = quotas.filter((peer) => peer.month >= first && peer.month < first + quota.periodMonths);
        const reserved = reservations.filter((reservation) => reservation.date.getUTCFullYear() === line.year && reservation.date.getUTCMonth() + 1 >= first && reservation.date.getUTCMonth() + 1 < first + quota.periodMonths).reduce((sum, reservation) => sum.plus(reservation.valueDecimal!), new Decimal("0"));
        periodAvailable.set(first, period.reduce((sum, peer) => sum.plus(peer.planned).minus(peer.consumed).minus(peer.blocked), new Decimal("0")).minus(reserved));
      }
      let remaining = amount;
      for (const quota of quotas) {
        const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
        const value = Decimal.max(0, Decimal.min(remaining, quota.planned.minus(quota.consumed).minus(quota.blocked), periodAvailable.get(first)!)); remaining = remaining.minus(value);
        if (value.greaterThan(0)) {
          periodAvailable.set(first, periodAvailable.get(first)!.minus(value));
          await tx.update(planningQuotas).set({ blocked: sql`${planningQuotas.blocked} + ${value.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
          await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: "BLOCK", value, reason: input.reason, submissionKey: `${input.submissionKey}:${quota.id}`, createdById: context.user.id });
        }
      }
      if (remaining.greaterThan(0)) throw new Error(`Saldo aberto insuficiente para contingenciar ${line.code}.`);
    }
    await planningAudit(tx, context, piece.id, "PLANNING_CONTINGENCY", input);
    return piece.id;
  });
}

export async function redistributePlanningQuotas(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), reason: z.string().trim().min(1), submissionKey: z.string().uuid() }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const [line] = await tx.select().from(planningLines).where(and(planningLineScope(context), eq(planningLines.instrumentId, piece.id), eq(planningLines.id, input.lineId))).limit(1);
    if (!line) throw new Error("Previsão não encontrada nas unidades autorizadas.");
    if (line.kind !== "EXPENSE") throw new Error("Redistribuição de cotas exige dotação de despesa.");
    const [prior] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_QUOTA_REDISTRIBUTE"), sql`${financialAuditLogs.payload}->'submissionKey' = ${JSON.stringify(input.submissionKey)}::jsonb`)).limit(1);
    if (prior) { if (contentHash(prior.payload) !== contentHash(input)) throw new Error("Solicitação repetida com dados diferentes."); return line.id; }
    const quotas = await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id)).orderBy(asc(planningQuotas.month));
    const closed = quotas.filter((row) => row.closedAt); const open = quotas.filter((row) => !row.closedAt);
    if (!closed.length || !open.length) throw new Error("São necessários meses fechados e abertos.");
    const unused = closed.reduce((sum, row) => sum.plus(row.planned.minus(row.consumed).minus(row.blocked)), new Decimal("0"));
    if (!unused.greaterThan(0)) throw new Error("Não há cota não utilizada nos meses fechados.");
    const cents = unused.mul(100); const base = cents.div(open.length).floor(); const remainder = cents.minus(base.mul(open.length)).toNumber();
    for (const row of closed) {
      const value = row.planned.minus(row.consumed).minus(row.blocked);
      await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} - ${value.toString()}::numeric` }).where(eq(planningQuotas.id, row.id));
      await tx.insert(planningQuotaEvents).values({ quotaId: row.id, type: "REDISTRIBUTE_OUT", value: value.negated(), reason: input.reason, submissionKey: `${input.submissionKey}:${row.id}`, createdById: context.user.id });
    }
    for (const [index, row] of open.entries()) {
      const value = base.plus(index < remainder ? 1 : 0).div(100);
      await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} + ${value.toString()}::numeric` }).where(eq(planningQuotas.id, row.id));
      await tx.insert(planningQuotaEvents).values({ quotaId: row.id, type: "REDISTRIBUTE_IN", value, reason: input.reason, submissionKey: `${input.submissionKey}:${row.id}`, createdById: context.user.id });
    }
    await planningAudit(tx, context, piece.id, "PLANNING_QUOTA_REDISTRIBUTE", input);
    return line.id;
  });
}
