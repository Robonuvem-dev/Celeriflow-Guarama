import { and, desc, eq, gte, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { db as applicationDatabase } from "@/db/client";
import { financialYears } from "@/db/schema/finance-years";
import { planningBudgetLaws, planningGuidelines, planningInstruments, planningLines, planningQuotaEvents, planningQuotas } from "@/db/schema/planning-budget";
import { planningBankAccounts, planningCashMovements, planningCommitmentMovements, planningCommitments, planningPayments, planningReservations, planningRevenueFacts, planningRevenueRedistributions, planningRevenueReversals } from "@/db/schema/planning-financial-sources";
import { planningRuntimeReady, readAdoptedPlanningLine, readPlanningRestrictions } from "@/db/repositories/planning/execution";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

type Db = DatabaseExecutor;
type Tx = DatabaseTransaction;
type Actor = { usuarioId: string; employeeId: string | null };
const enabled = (metadata: JsonValue | null) => !!metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.planningInternalExecution === true;

async function hasPlanningRuntime(db: Db) {
  return planningRuntimeReady(db);
}

/** Shared lock order: instrument before appropriation, including Finance/Procurement callers. */
export async function lockPlanningBudgetForAppropriation(tx: Tx, appropriationId: string) {
  if (!await hasPlanningRuntime(tx)) return;
  await tx.select({ id: planningInstruments.id }).from(planningInstruments).innerJoin(planningLines, eq(planningLines.instrumentId, planningInstruments.id)).where(eq(planningLines.appropriationId, appropriationId)).for("update", { of: planningInstruments });
}

export async function getPlanningBudgetRestrictions(db: Db, appropriationId: string) {
  if (!await hasPlanningRuntime(db)) return { creditReserved: new Decimal(0), contingent: new Decimal(0) };
  return readPlanningRestrictions(db, appropriationId);
}

async function adoptedLine(db: Db, appropriationId: string) {
  if (!await hasPlanningRuntime(db)) return null;
  const line = await readAdoptedPlanningLine(db, appropriationId);
  if (line?.instrument.implantedAt && !enabled(line.instrument.annualBudgetLaw?.metadata ?? null)) throw new Error("Conecte a execução da LOA no Planejamento antes de reservar ou executar esta dotação.");
  return line && enabled(line.instrument.annualBudgetLaw?.metadata ?? null) ? line : null;
}

/** Future procurement reservations are permitted only against implanted, traced budgets. */
export async function assertPlanningReservationYear(db: Db, appropriationId: string, financialYearId: string, date: Date) {
  const line = await adoptedLine(db, appropriationId);
  const [year] = await db.select().from(financialYears).where(eq(financialYears.id, financialYearId)).limit(1);
  if (!year) throw new Error("Exercício financeiro não encontrado.");
  if (!line || !line.instrument.implantedAt || line.instrument.annualBudgetLaw?.financialYearId !== year.id || line.year !== year.year || !["Preparação", "Aberto"].includes(year.status) || date.getUTCFullYear() !== year.year || date < year.startDate || date > year.endDate) throw new Error("Reserva futura exige orçamento implantado, conectado e data dentro do exercício de destino.");
  return year;
}

export async function assertPlanningPeriodAvailability(tx: Tx, appropriationId: string, date: Date, value: Decimal, excludeReservationId?: string) {
  const line = await adoptedLine(tx, appropriationId);
  if (!line) return false;
  if (date.getUTCFullYear() !== line.year || !value.isFinite() || !value.greaterThan(0)) throw new Error("Data ou valor incompatível com a cota do exercício.");
  const quota = line.quotas.find((row) => row.month === date.getUTCMonth() + 1);
  if (!quota || line.quotas.length !== 12 || quota.closedAt) throw new Error("Cadastre os doze meses e utilize um período de cota aberto.");
  const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
  const period = line.quotas.filter((row) => row.month >= first && row.month < first + quota.periodMonths && !row.closedAt);
  const start = new Date(Date.UTC(line.year, first - 1, 1)), end = new Date(Date.UTC(line.year, first - 1 + quota.periodMonths, 1));
  const reservations = await tx.select({ valueDecimal: planningReservations.valueDecimal }).from(planningReservations).where(and(eq(planningReservations.appropriationId, appropriationId), eq(planningReservations.status, "Ativa"), gte(planningReservations.date, start), lt(planningReservations.date, end), excludeReservationId ? ne(planningReservations.id, excludeReservationId) : undefined));
  const reserved = reservations.reduce((sum, row) => { if (row.valueDecimal === null) throw new Error("Reconcilie o valor Decimal das reservas antes de executar a cota."); return sum.plus(row.valueDecimal); }, new Decimal(0));
  const available = period.reduce((sum, row) => sum.plus(row.planned).minus(row.consumed).minus(row.blocked), new Decimal(0)).minus(reserved);
  if (value.greaterThan(available)) throw new Error("O lançamento excede a cota do período de Planejamento, considerando reservas e contingenciamento.");
  return true;
}

export async function recordPlanningFinanceExecution(tx: Tx, actor: Actor, input: { appropriationId: string; operation: "CONSUME" | "REVERSE" | "PAY" | "REVERSE_PAYMENT"; date: Date; value: Decimal; key: string; originPrefix?: string }) {
  await lockPlanningBudgetForAppropriation(tx, input.appropriationId);
  const line = await adoptedLine(tx, input.appropriationId);
  if (!line) return;
  if (!input.value.isFinite() || !input.value.greaterThan(0)) throw new Error("Execução financeira exige valor positivo.");
  const [duplicateRow] = await tx.select({ event: planningQuotaEvents, lineId: planningQuotas.lineId }).from(planningQuotaEvents).innerJoin(planningQuotas, eq(planningQuotas.id, planningQuotaEvents.quotaId)).where(eq(planningQuotaEvents.submissionKey, input.key)).limit(1);
  const duplicate = duplicateRow ? { ...duplicateRow.event, quota: { lineId: duplicateRow.lineId } } : null;
  if (duplicate) {
    if (duplicate.quota.lineId !== line.id || duplicate.type !== input.operation || !duplicate.value.equals(input.value) || duplicate.effectiveAt.getTime() !== input.date.getTime()) throw new Error("Execução já registrada com outros dados.");
    return;
  }
  if (input.date.getUTCFullYear() !== line.year) throw new Error("Execução financeira fora do exercício da cota.");
  if (["REVERSE", "REVERSE_PAYMENT"].includes(input.operation)) {
    const replayRows = await tx.select({ event: planningQuotaEvents }).from(planningQuotaEvents).innerJoin(planningQuotas, eq(planningQuotas.id, planningQuotaEvents.quotaId)).where(and(eq(planningQuotas.lineId, line.id), sql`starts_with(${planningQuotaEvents.submissionKey}, ${`${input.key}:`})`));
    const replay = replayRows.map(row => row.event);
    if (replay.length) {
      if (replay.some((event) => event.type !== input.operation || event.effectiveAt.getTime() !== input.date.getTime()) || !replay.reduce((sum, event) => sum.plus(event.value), new Decimal(0)).equals(input.value)) throw new Error("Estorno já registrado com outros dados.");
      return;
    }
    const originRows = await tx.select({ event: planningQuotaEvents }).from(planningQuotaEvents).innerJoin(planningQuotas, eq(planningQuotas.id, planningQuotaEvents.quotaId)).where(and(eq(planningQuotas.lineId, line.id), eq(planningQuotaEvents.type, input.operation === "REVERSE" ? "CONSUME" : "PAY"), sql`starts_with(${planningQuotaEvents.submissionKey}, ${input.originPrefix ?? input.key})`)).orderBy(desc(planningQuotaEvents.effectiveAt), desc(planningQuotaEvents.id));
    const origins = await Promise.all(originRows.map(async row => ({ ...row.event, releases: await tx.select().from(planningQuotaEvents).where(eq(planningQuotaEvents.originEventId, row.event.id)) })));
    let remaining = input.value;
    for (const origin of origins) {
      const available = origin.value.minus(origin.releases.reduce((sum, row) => sum.plus(row.value), new Decimal(0)));
      const value = Decimal.min(remaining, available);
      if (!value.greaterThan(0)) continue;
      if (input.date < origin.effectiveAt) throw new Error("Estorno não pode anteceder a execução original.");
      await tx.update(planningQuotas).set(input.operation === "REVERSE" ? { consumed: sql`${planningQuotas.consumed} - ${value.toString()}::numeric` } : { disbursementPaid: sql`${planningQuotas.disbursementPaid} - ${value.toString()}::numeric` }).where(eq(planningQuotas.id, origin.quotaId));
      await tx.insert(planningQuotaEvents).values({ quotaId: origin.quotaId, type: input.operation, value, effectiveAt: input.date, reason: "Estorno financeiro canônico", submissionKey: `${input.key}:${origin.id}`, originEventId: origin.id, createdById: actor.usuarioId });
      remaining = remaining.minus(value);
    }
    if (remaining.greaterThan(0)) throw new Error("O estorno excede a execução financeira vinculada às cotas.");
    return;
  }
  const quota = line.quotas.find((row) => row.month === input.date.getUTCMonth() + 1);
  if (!quota || quota.closedAt) throw new Error("A execução exige cota mensal aberta.");
  if (input.operation === "PAY") {
    if (quota.disbursementPaid.plus(input.value).greaterThan(quota.disbursementPlanned)) throw new Error("O pagamento excede o cronograma mensal de desembolso.");
    await tx.update(planningQuotas).set({ disbursementPaid: sql`${planningQuotas.disbursementPaid} + ${input.value.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
  } else {
    let remaining = input.value.minus(quota.planned.minus(quota.consumed).minus(quota.blocked));
    const first = Math.floor((quota.month - 1) / quota.periodMonths) * quota.periodMonths + 1;
    for (const peer of line.quotas.filter((row) => row.id !== quota.id && !row.closedAt && row.month >= first && row.month < first + quota.periodMonths)) {
      if (!remaining.greaterThan(0)) break;
      const moved = Decimal.min(remaining, peer.planned.minus(peer.consumed).minus(peer.blocked));
      if (!moved.greaterThan(0)) continue;
      await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} - ${moved.toString()}::numeric` }).where(eq(planningQuotas.id, peer.id));
      await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} + ${moved.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
      for (const [id, type, signed] of [[peer.id, "PERIOD_TRANSFER_OUT", moved.negated()], [quota.id, "PERIOD_TRANSFER_IN", moved]] as const) await tx.insert(planningQuotaEvents).values({ quotaId: id, type, value: signed, effectiveAt: input.date, reason: "Consumo financeiro no período configurado", submissionKey: `${input.key}:${type}:${peer.id}`, createdById: actor.usuarioId });
      remaining = remaining.minus(moved);
    }
    if (remaining.greaterThan(0)) throw new Error("Cotas insuficientes para a execução financeira.");
    await tx.update(planningQuotas).set({ consumed: sql`${planningQuotas.consumed} + ${input.value.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
  }
  await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: input.operation, value: input.value, effectiveAt: input.date, reason: input.operation === "PAY" ? "Despesa paga bruta — Financeiro" : "Empenhamento canônico — Financeiro", submissionKey: input.key, createdById: actor.usuarioId });
}

export async function readPlanningFinancialExecution(context: { user: AppContext["user"]; database?: DatabaseExecutor }, references: { id: string; year: number; budgetUnitId: string; resourceSourceId: string; kind: string; appropriationId?: string | null; revenueNature?: { id: string } | null }[], asOf: Date) {
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, rows: [] };
  const db = context.database ?? applicationDatabase;
  const runtime = await db.execute<{ ready: boolean }>(sql`SELECT (to_regclass('"Commitment"') IS NOT NULL AND to_regclass('"CommitmentMovement"') IS NOT NULL AND to_regclass('"TreasuryMovement"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`);
  if (!runtime.rows[0]?.ready) return { status: "UNAVAILABLE" as const, rows: [] };
  type ExecutionRow = { lineId: string; status: "CONNECTED" | "UNMAPPED" | "AMBIGUOUS" | "UNRECONCILED"; committed: string | null; collected: string | null; paidNet: string | null; paidGross: string | null; appropriationId: string | null };
  const rows: ExecutionRow[] = [];
  const mapped = new Map<string, ExecutionRow>();
  for (const line of references) {
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) throw new Error("Execução financeira fora das unidades autorizadas.");
    const [sourceRow] = await db.select({ line: planningLines, instrument: planningInstruments }).from(planningLines).innerJoin(planningInstruments, eq(planningInstruments.id, planningLines.instrumentId)).where(eq(planningLines.id, line.id)).limit(1);
    const [parent] = sourceRow?.instrument.parentId ? await db.select().from(planningInstruments).where(eq(planningInstruments.id, sourceRow.instrument.parentId)).limit(1) : [];
    const [grandparent] = parent?.parentId ? await db.select().from(planningInstruments).where(eq(planningInstruments.id, parent.parentId)).limit(1) : [];
    const source = sourceRow ? { ...sourceRow.line, instrument: { ...sourceRow.instrument, parent: parent ? { ...parent, parent: grandparent ?? null } : null } } : null;
    if (!source || source.year !== line.year || source.kind !== line.kind || source.budgetUnitId !== line.budgetUnitId || source.resourceSourceId !== line.resourceSourceId) throw new Error("Referência de execução fora da classificação autorizada.");
    const from = new Date(Date.UTC(line.year, 0, 1)), until = new Date(Math.min(asOf.getTime(), Date.UTC(line.year + 1, 0, 1) - 1));
    let committed = new Decimal(0), collected = new Decimal(0), paid = new Decimal(0), paidGross = new Decimal(0);
    let appropriationId = source.appropriationId;
    if (line.kind === "EXPENSE" && !appropriationId) {
      const root = source.instrument.multiYearPlanId ?? source.instrument.parent?.multiYearPlanId ?? source.instrument.parent?.parent?.multiYearPlanId;
      const matches = await db.select({ code: planningLines.code, appropriationId: planningLines.appropriationId }).from(planningLines).innerJoin(planningInstruments, eq(planningInstruments.id, planningLines.instrumentId)).innerJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningInstruments.annualBudgetLawId)).innerJoin(planningGuidelines, eq(planningGuidelines.id, planningBudgetLaws.budgetGuidelineId)).where(and(eq(planningLines.kind, "EXPENSE"), eq(planningLines.year, source.year), eq(planningLines.budgetUnitId, source.budgetUnitId), eq(planningLines.resourceSourceId, source.resourceSourceId), sql`${planningLines.programId} IS NOT DISTINCT FROM ${source.programId}`, sql`${planningLines.actionId} IS NOT DISTINCT FROM ${source.actionId}`, sql`${planningLines.expenseNatureId} IS NOT DISTINCT FROM ${source.expenseNatureId}`, sql`${planningLines.functionCode} IS NOT DISTINCT FROM ${source.functionCode}`, sql`${planningLines.subfunctionCode} IS NOT DISTINCT FROM ${source.subfunctionCode}`, sql`${planningLines.product} IS NOT DISTINCT FROM ${source.product}`, sql`${planningLines.productUnit} IS NOT DISTINCT FROM ${source.productUnit}`, isNotNull(planningLines.appropriationId), eq(planningInstruments.kind, "LOA"), eq(planningInstruments.governmentEntityId, source.instrument.governmentEntityId), isNotNull(planningInstruments.implantedAt), eq(planningGuidelines.multiYearPlanId, root ?? "")));
      const sameCode = matches.filter((candidate) => candidate.code === source.code);
      const candidates = sameCode.length ? sameCode : matches;
      if (candidates.length !== 1) { rows.push({ lineId: line.id, status: candidates.length ? "AMBIGUOUS" : "UNMAPPED", committed: null, collected: null, paidNet: null, paidGross: null, appropriationId: null }); continue; }
      appropriationId = candidates[0].appropriationId;
    }
    if (line.kind === "EXPENSE" && appropriationId) {
      const commitmentRows = await db.select().from(planningCommitments).where(and(eq(planningCommitments.appropriationId, appropriationId), gte(planningCommitments.date, from), lte(planningCommitments.date, until)));
      const commitments = await Promise.all(commitmentRows.map(async row => ({ ...row, movements: await db.select().from(planningCommitmentMovements).where(and(eq(planningCommitmentMovements.commitmentId, row.id), lte(planningCommitmentMovements.date, until))) })));
      if (commitments.some((row) => row.valueDecimal === null || row.movements.some((movement) => !["Reforço", "Anulação"].includes(movement.type)))) { rows.push({ lineId: line.id, status: "UNRECONCILED", committed: null, collected: null, paidNet: null, paidGross: null, appropriationId }); continue; }
      committed = commitments.reduce((sum, row) => sum.plus(row.movements.reduce((value, movement) => movement.type === "Reforço" ? value.plus(movement.valueDecimal) : value.minus(movement.valueDecimal), row.valueDecimal!)), new Decimal(0));
      const payments = await db.select({ id: planningPayments.id, valueDecimal: planningPayments.valueDecimal }).from(planningPayments).innerJoin(planningCommitments, eq(planningCommitments.id, planningPayments.commitmentId)).where(eq(planningCommitments.appropriationId, appropriationId));
      const cash = await db.select().from(planningCashMovements).where(and(eq(planningCashMovements.status, "Confirmado"), gte(planningCashMovements.date, from), lte(planningCashMovements.date, until), eq(planningCashMovements.sourceType, "PAYMENT"), inArray(planningCashMovements.sourceId, payments.map(payment => payment.id))));
      const amounts = new Map(payments.map((payment) => [payment.id, payment.valueDecimal]));
      if (cash.some((movement) => !amounts.get(movement.sourceId ?? ""))) { rows.push({ lineId: line.id, status: "UNRECONCILED", committed: committed.toFixed(2), collected: null, paidNet: null, paidGross: null, appropriationId }); continue; }
      paidGross = cash.reduce((sum, row) => row.type === "PaymentReversal" ? sum.minus(amounts.get(row.sourceId!)!) : row.type === "Payment" ? sum.plus(amounts.get(row.sourceId!)!) : sum, new Decimal(0));
      paid = cash.reduce((sum, row) => row.type === "PaymentReversal" ? sum.minus(row.valueDecimal) : row.type === "Payment" ? sum.plus(row.valueDecimal) : sum, new Decimal(0));
    } else if (line.kind === "REVENUE" && source.revenueNatureId) {
      const revenueIds = db.select({ id: planningRevenueFacts.id }).from(planningRevenueFacts).innerJoin(planningBankAccounts, eq(planningBankAccounts.id, planningRevenueFacts.bankAccountId)).where(and(eq(planningRevenueFacts.revenueNatureId, source.revenueNatureId), eq(planningRevenueFacts.resourceSourceId, line.resourceSourceId), eq(planningBankAccounts.budgetUnitId, line.budgetUnitId)));
      const receipts = await db.select().from(planningCashMovements).where(and(eq(planningCashMovements.status, "Confirmado"), gte(planningCashMovements.date, from), lte(planningCashMovements.date, until), or(inArray(planningCashMovements.revenueId, revenueIds), inArray(planningCashMovements.id, db.select({ id: planningRevenueReversals.treasuryMovementId }).from(planningRevenueReversals).where(inArray(planningRevenueReversals.revenueId, revenueIds))))));
      collected = receipts.reduce((sum, row) => row.type === "RevenueReversal" ? sum.minus(row.valueDecimal) : row.type === "Revenue" ? sum.plus(row.valueDecimal) : sum, new Decimal(0));
      const adjustments = await db.select({ sourceResourceSourceId: planningRevenueRedistributions.sourceResourceSourceId, valueDecimal: planningRevenueRedistributions.valueDecimal }).from(planningRevenueRedistributions).innerJoin(planningRevenueFacts, eq(planningRevenueFacts.id, planningRevenueRedistributions.revenueId)).innerJoin(planningBankAccounts, eq(planningBankAccounts.id, planningRevenueFacts.bankAccountId)).where(and(gte(planningRevenueRedistributions.date, from), lte(planningRevenueRedistributions.date, until), eq(planningRevenueFacts.revenueNatureId, source.revenueNatureId), eq(planningBankAccounts.budgetUnitId, line.budgetUnitId), or(eq(planningRevenueRedistributions.sourceResourceSourceId, line.resourceSourceId), eq(planningRevenueRedistributions.destinationResourceSourceId, line.resourceSourceId))));
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
