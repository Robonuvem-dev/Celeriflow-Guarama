import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import { planningEntityUnits, planningInstruments, planningLines, planningQuotaEvents, planningQuotas } from "@/db/schema/planning-budget";
import { planningBankAccounts } from "@/db/schema/planning-financial-sources";
import { findConnectedRevenuePiece } from "@/db/repositories/planning/execution";

type Tx = DatabaseTransaction;
type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type RevenueFact = { id: string; financialYearId: string | null; revenueNatureId: string; resourceSourceId: string; bankAccountId: string | null; valueDecimal: Decimal | null; collectionDate: Date | null };

async function runtime(tx: Tx) {
  const result = await tx.execute<{ ready: boolean }>(sql`SELECT (to_regclass('"PlanningBudgetLine"') IS NOT NULL AND to_regclass('"PlanningQuotaEvent"') IS NOT NULL) AS ready`);
  return result.rows[0]?.ready === true;
}

/** Instrument locks precede Revenue/BankAccount locks in all connected receipt paths. */
export async function lockPlanningRevenueBudget(tx: Tx, bankAccountId: string, date: Date) {
  if (!await runtime(tx)) return;
  const [account] = await tx.select().from(planningBankAccounts).where(eq(planningBankAccounts.id, bankAccountId)).limit(1);
  if (!account?.budgetUnitId) return;
  await tx.select({ id: planningInstruments.id }).from(planningInstruments).innerJoin(planningEntityUnits, eq(planningEntityUnits.governmentEntityId, planningInstruments.governmentEntityId)).where(and(eq(planningInstruments.kind, "LOA"), eq(planningInstruments.startYear, date.getUTCFullYear()), eq(planningEntityUnits.budgetUnitId, account.budgetUnitId))).orderBy(planningInstruments.id).for("update", { of: planningInstruments });
}

async function connectedPiece(tx: Tx, accountId: string, year: number) {
  const [account] = await tx.select().from(planningBankAccounts).where(eq(planningBankAccounts.id, accountId)).limit(1);
  if (!account?.budgetUnitId) return null;
  return findConnectedRevenuePiece(tx, account.budgetUnitId, year);
}

async function revenueQuotaEvent(tx: Tx, key: string) {
  const [row] = await tx.select({ event: planningQuotaEvents, quota: planningQuotas, line: planningLines }).from(planningQuotaEvents).innerJoin(planningQuotas, eq(planningQuotas.id, planningQuotaEvents.quotaId)).innerJoin(planningLines, eq(planningLines.id, planningQuotas.lineId)).where(eq(planningQuotaEvents.submissionKey, key)).limit(1);
  if (!row) return null;
  const releases = await tx.select().from(planningQuotaEvents).where(eq(planningQuotaEvents.originEventId, row.event.id));
  return { ...row.event, quota: { ...row.quota, line: row.line }, releases };
}

export async function recordPlanningRevenueCollection(tx: Tx, actor: Actor, fact: RevenueFact) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const piece = await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear());
  if (!piece) return;
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(piece.budgetUnitId)) throw new Error("Arrecadação fora das unidades autorizadas.");
  if (!fact.valueDecimal?.greaterThan(0)) throw new Error("Reconcilie o valor Decimal da arrecadação.");
  const key = `finance:revenue:${fact.id}:collected`;
  const duplicate = await revenueQuotaEvent(tx, key);
  if (duplicate) {
    if (!duplicate.value.equals(fact.valueDecimal) || duplicate.effectiveAt.getTime() !== fact.collectionDate.getTime() || duplicate.quota.line.instrumentId !== piece.instrumentId) throw new Error("Arrecadação já vinculada com outros dados.");
    return;
  }
  const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.instrumentId), eq(planningLines.year, fact.collectionDate.getUTCFullYear()), eq(planningLines.kind, "REVENUE"), eq(planningLines.budgetUnitId, piece.budgetUnitId), eq(planningLines.revenueNatureId, fact.revenueNatureId), eq(planningLines.resourceSourceId, fact.resourceSourceId)));
  if (lines.length !== 1) throw new Error("Mapeie uma única previsão de receita por natureza, fonte, unidade e exercício antes de arrecadar.");
  const quotas = await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, lines[0].id));
  const quota = quotas.find((row) => row.month === fact.collectionDate!.getUTCMonth() + 1);
  if (!quota || quotas.length !== 12 || quota.closedAt) throw new Error("A arrecadação exige doze metas mensais e mês aberto.");
  // Revenue realization can exceed its forecast. It is not an expenditure ceiling.
  await tx.update(planningQuotas).set({ consumed: sql`${planningQuotas.consumed} + ${fact.valueDecimal.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
  await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: "CONSUME", effectiveAt: fact.collectionDate, value: fact.valueDecimal, reason: "Arrecadação canônica — Financeiro", submissionKey: key, createdById: actor.usuarioId });
}

export async function recordPlanningRevenueReversal(tx: Tx, actor: Actor, fact: RevenueFact, date: Date) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const origin = await revenueQuotaEvent(tx, `finance:revenue:${fact.id}:collected`);
  if (!origin) {
    if (await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear())) throw new Error("Reconcilie a arrecadação anterior antes de estornar sua meta mensal.");
    return;
  }
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(origin.quota.line.budgetUnitId)) throw new Error("Estorno de arrecadação fora das unidades autorizadas.");
  if (date < origin.effectiveAt || date.getUTCFullYear() !== origin.quota.line.year) throw new Error("Estorno de arrecadação fora da data/exercício da origem.");
  const key = `finance:revenue:${fact.id}:reversed`;
  const duplicate = await revenueQuotaEvent(tx, key);
  if (duplicate) {
    if (duplicate.originEventId !== origin.id || duplicate.effectiveAt.getTime() !== date.getTime() || !duplicate.value.equals(fact.valueDecimal ?? -1)) throw new Error("Estorno de arrecadação já registrado com outros dados.");
    return;
  }
  if (!fact.valueDecimal?.equals(origin.value) || origin.releases.length || origin.quota.consumed.lessThan(origin.value)) throw new Error("O estorno excede ou diverge da arrecadação vinculada.");
  await tx.update(planningQuotas).set({ consumed: sql`${planningQuotas.consumed} - ${origin.value.toString()}::numeric` }).where(eq(planningQuotas.id, origin.quotaId));
  await tx.insert(planningQuotaEvents).values({ quotaId: origin.quotaId, type: "REVERSE", effectiveAt: date, value: origin.value, originEventId: origin.id, reason: "Estorno de arrecadação canônica — Financeiro", submissionKey: key, createdById: actor.usuarioId });
}

export async function recordPlanningRevenueRedistribution(tx: Tx, actor: Actor, fact: RevenueFact, input: { id: string; destinationResourceSourceId: string; date: Date; valueDecimal: Decimal }) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const origin = await revenueQuotaEvent(tx, `finance:revenue:${fact.id}:collected`);
  if (!origin) {
    if (await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear())) throw new Error("Reconcilie a arrecadação anterior antes de redistribuir sua fonte.");
    return;
  }
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(origin.quota.line.budgetUnitId)) throw new Error("Redistribuição fora das unidades autorizadas.");
  const key = `finance:revenueRedistribution:${input.id}`;
  if (await revenueQuotaEvent(tx, `${key}:out`)) return;
  if (input.date < origin.effectiveAt || input.date.getUTCFullYear() !== origin.quota.line.year || origin.quota.consumed.lessThan(input.valueDecimal)) throw new Error("Redistribuição fora da data ou saldo da arrecadação.");
  const targets = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, origin.quota.line.instrumentId), eq(planningLines.kind, "REVENUE"), eq(planningLines.year, origin.quota.line.year), eq(planningLines.budgetUnitId, origin.quota.line.budgetUnitId), eq(planningLines.revenueNatureId, fact.revenueNatureId), eq(planningLines.resourceSourceId, input.destinationResourceSourceId)));
  if (targets.length !== 1) throw new Error("Mapeie uma única previsão de destino com doze metas mensais antes de redistribuir a fonte.");
  const quotas = await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, targets[0].id));
  if (quotas.length !== 12) throw new Error("Mapeie uma única previsão de destino com doze metas mensais antes de redistribuir a fonte.");
  const target = quotas.find((quota) => quota.month === origin.quota.month)!;
  await tx.update(planningQuotas).set({ consumed: sql`${planningQuotas.consumed} - ${input.valueDecimal.toString()}::numeric` }).where(eq(planningQuotas.id, origin.quotaId));
  await tx.update(planningQuotas).set({ consumed: sql`${planningQuotas.consumed} + ${input.valueDecimal.toString()}::numeric` }).where(eq(planningQuotas.id, target.id));
  for (const [quotaId, type, suffix] of [[origin.quotaId, "REVENUE_SOURCE_OUT", "out"], [target.id, "REVENUE_SOURCE_IN", "in"]] as const) await tx.insert(planningQuotaEvents).values({ quotaId, type, value: input.valueDecimal, effectiveAt: input.date, reason: "Redistribuição de fonte da arrecadação canônica", submissionKey: `${key}:${suffix}`, createdById: actor.usuarioId });
}
