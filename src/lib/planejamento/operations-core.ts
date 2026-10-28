import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseTransaction } from "@/db/transaction";
import { planningAppropriations, planningBudgetLaws, planningBudgetMovements, planningCreditBatches, planningCreditLines, planningGuidelines, planningInstruments, planningLines, planningMovements, planningMultiYearPlans, planningQuotaEvents, planningQuotas } from "@/db/schema/planning-budget";
import { planningFixations, planningForecasts, planningIntegrationCommands, planningVersions } from "@/db/schema/planning-legal";
import { planningReservations } from "@/db/schema/planning-financial-sources";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { financialYears } from "@/db/schema/finance-years";
import { governmentEntities } from "@/db/schema/master-data";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { readPlanningPrograms, readPlanningSnapshotLines, readPlanningSnapshotPiece, readPlanningSnapshotReferences } from "@/db/repositories/planning/snapshots";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { PlanningContext } from "./access";
import { deliverPlanningAccountingCommand } from "./accounting-bridge";

export type PlanningTx = DatabaseTransaction;
export const jsonValue = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export const contentHash = (value: unknown) => {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : input;
  return createHash("sha256").update(JSON.stringify(canonical(jsonValue(value)))).digest("hex");
};

export async function lockLegalInstrument(tx: PlanningTx, context: PlanningContext, id: string) {
  const [visible] = await tx.select().from(planningInstruments).where(and(eq(planningInstruments.id, id), planningInstrumentScope(context))).limit(1);
  if (!visible) throw new AccessError("Peça não encontrada neste escopo.", 404);
  await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(eq(planningInstruments.id, id)).for("update");
  if (visible.multiYearPlanId) await tx.select({ id: planningMultiYearPlans.id }).from(planningMultiYearPlans).where(eq(planningMultiYearPlans.id, visible.multiYearPlanId)).for("update");
  if (visible.budgetGuidelineId) await tx.select({ id: planningGuidelines.id }).from(planningGuidelines).where(eq(planningGuidelines.id, visible.budgetGuidelineId)).for("update");
  if (visible.annualBudgetLawId) await tx.select({ id: planningBudgetLaws.id }).from(planningBudgetLaws).where(eq(planningBudgetLaws.id, visible.annualBudgetLawId)).for("update");
  const instrument = await readPlanningInstrument(tx, id);
  if (!instrument) throw new AccessError("Peça não encontrada neste escopo.", 404);
  return instrument;
}
export type LegalInstrument = Awaited<ReturnType<typeof lockLegalInstrument>>;
export const canonicalPiece = (piece: LegalInstrument) => piece.multiYearPlan ?? piece.budgetGuideline ?? piece.annualBudgetLaw;

export async function planningAppropriationCode(tx: PlanningTx, piece: LegalInstrument, line: { year: number; code: string }) {
  const [entity] = await tx.select({ code: governmentEntities.code }).from(governmentEntities).where(eq(governmentEntities.id, piece.governmentEntityId)).limit(1);
  if (!entity) throw new Error("Entidade orçamentária não encontrada.");
  return `${entity.code}:${line.year}:${line.code}`;
}

export async function planningProgramCatalog(tx: PlanningTx, piece: { multiYearPlanId: string | null; budgetGuidelineId: string | null; annualBudgetLawId: string | null }) {
  let ppaId = piece.multiYearPlanId;
  if (!ppaId && piece.budgetGuidelineId) ppaId = (await tx.select({ id: planningGuidelines.multiYearPlanId }).from(planningGuidelines).where(eq(planningGuidelines.id, piece.budgetGuidelineId)).limit(1))[0]?.id ?? null;
  if (!ppaId && piece.annualBudgetLawId) ppaId = (await tx.select({ id: planningGuidelines.multiYearPlanId }).from(planningBudgetLaws).leftJoin(planningGuidelines, eq(planningGuidelines.id, planningBudgetLaws.budgetGuidelineId)).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId)).limit(1))[0]?.id ?? null;
  return ppaId ? readPlanningPrograms(tx, ppaId) : [];
}

export async function assertWholePiece(tx: PlanningTx, context: PlanningContext, instrumentId: string) {
  if (!isSystemAdministrator(context.user) && (await tx.select({ id: planningLines.id }).from(planningLines).where(and(eq(planningLines.instrumentId, instrumentId), sql`NOT (${planningLines.budgetUnitId} = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`)).limit(1)).length) throw new AccessError("Esta operação exige acesso a todas as unidades da peça.", 403);
}

export async function planningAudit(tx: PlanningTx, context: PlanningContext, id: string, action: string, payload: unknown) {
  await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, entityType: "PLANNING_INSTRUMENT", entityId: id, action, payload: jsonValue(payload) });
}

export async function snapshotVersion(tx: PlanningTx, context: PlanningContext, instrumentId: string, effectiveAt: Date, legalActNumber: string, reason: string) {
  const piece = await readPlanningSnapshotPiece(tx, instrumentId);
  const [existing] = await tx.select().from(planningVersions).where(and(eq(planningVersions.instrumentId, instrumentId), eq(planningVersions.number, piece.revision))).limit(1);
  if (existing) return existing.id;
  const lines = await readPlanningSnapshotLines(tx, eq(planningLines.instrumentId, instrumentId));
  const programs = await planningProgramCatalog(tx, piece);
  const references = await readPlanningSnapshotReferences(tx, instrumentId);
  const snapshot = jsonValue({ piece: { ...piece, programs, ...references }, lines: lines.map(line => ({ ...line, destinationEntity: line.destinationEntity ? { id: line.destinationEntity.id, name: line.destinationEntity.name } : null })) });
  const [version] = await tx.insert(planningVersions).values({ instrumentId, number: piece.revision, effectiveAt, legalActNumber, reason, snapshot, hash: contentHash(snapshot), createdById: context.user.id }).returning({ id: planningVersions.id });
  return version.id;
}

export async function linePosition(tx: PlanningTx, lineId: string, at?: Date) {
  const [line] = await tx.select().from(planningLines).where(eq(planningLines.id, lineId)).limit(1);
  if (!line) throw new Error("Previsão não encontrada.");
  const rows = await tx.select({ value: planningMovements.value }).from(planningMovements).where(and(eq(planningMovements.lineId, lineId), at ? lte(planningMovements.effectiveAt, at) : undefined));
  return rows.reduce((sum, row) => sum.plus(row.value), line.originalValue);
}

/** Caller holds the instrument lock. All legal effects use this command. */
export async function applyLineDelta(tx: PlanningTx, context: PlanningContext, piece: LegalInstrument, input: { lineId: string; value: Decimal; effectiveAt: Date; reason: string; legalText: string; legalActNumber: string; key: string; allowBlocked?: boolean; reservationBatchId?: string }) {
  const [line] = await tx.select().from(planningLines).where(and(planningLineScope(context), eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, piece.id))).limit(1);
  if (!line) throw new AccessError("Previsão não encontrada nas unidades autorizadas.", 403);
  if (input.value.isZero()) throw new Error("Alteração sem valor.");
  const canonical = canonicalPiece(piece);
  const year = input.effectiveAt.getUTCFullYear();
  if (!Number.isFinite(input.effectiveAt.getTime()) || year > piece.endYear || input.effectiveAt.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10) || canonical?.sanctionedAt && input.effectiveAt < canonical.sanctionedAt) throw new Error("Ato fora da vigência legal da peça.");
  if (piece.annualBudgetLaw) { const [year] = await tx.select().from(financialYears).where(eq(financialYears.id, piece.annualBudgetLaw.financialYearId)).limit(1); if (!year || !["Preparação", "Aberto"].includes(year.status)) throw new Error("O exercício financeiro não está disponível para alterações."); }
  const [existing] = await tx.select().from(planningMovements).where(eq(planningMovements.idempotencyKey, input.key)).limit(1);
  if (existing) {
    if (existing.lineId !== line.id || !existing.value.equals(input.value) || existing.effectiveAt.getTime() !== input.effectiveAt.getTime() || existing.legalActNumber !== input.legalActNumber || existing.reason !== input.reason || existing.legalText !== input.legalText) throw new Error("Solicitação repetida com dados diferentes.");
    return existing.id;
  }
  if (line.amendmentBlocked && !input.allowBlocked) throw new Error("Dotação bloqueada para emendas.");
  const history = await tx.select().from(planningMovements).where(eq(planningMovements.lineId, line.id));
  const days = new Map<number, Decimal>();
  for (const row of [...history, { effectiveAt: input.effectiveAt, value: input.value }]) days.set(row.effectiveAt.getTime(), (days.get(row.effectiveAt.getTime()) ?? new Decimal(0)).plus(row.value));
  let balance = line.originalValue;
  for (const [, delta] of [...days].sort(([a], [b]) => a - b)) { balance = balance.plus(delta); if (balance.isNegative()) throw new Error("A alteração produziria saldo negativo em uma data do histórico."); }
  const reservations = await tx.select({ reserved: planningCreditLines.reserved }).from(planningCreditLines).innerJoin(planningCreditBatches, eq(planningCreditBatches.id, planningCreditLines.batchId)).where(and(eq(planningCreditLines.lineId, line.id), inArray(planningCreditBatches.status, ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"]), input.reservationBatchId ? ne(planningCreditLines.batchId, input.reservationBatchId) : undefined));
  const reserved = reservations.reduce((sum, row) => sum.plus(row.reserved), new Decimal(0));
  if (balance.lessThan(reserved)) throw new Error("Saldo reservado por outra prévia de crédito.");
  if (line.appropriationId) {
    const [appropriation] = await tx.select().from(planningAppropriations).where(eq(planningAppropriations.id, line.appropriationId)).for("update");
    if (!appropriation) throw new Error("Dotação implantada não encontrada.");
    const active = await tx.select().from(planningReservations).where(and(eq(planningReservations.appropriationId, appropriation.id), eq(planningReservations.status, "Ativa")));
    const reservedPurchases = active.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Decimal(row.value)), new Decimal(0));
    const consumed = appropriation.committedValueDecimal ?? new Decimal(appropriation.committedValue);
    if (balance.lessThan(consumed.plus(reservedPurchases).plus(reserved))) throw new Error("A redução excede o saldo disponível da dotação implantada.");
    await tx.update(planningAppropriations).set({ updatedValueDecimal: balance, updatedValue: balance.toNumber() }).where(eq(planningAppropriations.id, appropriation.id));
    await tx.insert(planningBudgetMovements).values({ appropriationId: appropriation.id, date: input.effectiveAt, type: input.value.isPositive() ? "Suplementação" : "Anulação", valueDecimal: input.value.abs(), justification: input.reason, sourceModule: "PLANEJAMENTO", sourceType: "LEGAL_CHANGE", sourceId: input.key, idempotencyKey: `planning:${input.key}`, eventType: "PLANNING_LEGAL_CHANGE" });
  }
  const quotas = await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id)).orderBy(asc(planningQuotas.month));
  if (quotas.length) {
    const open = quotas.filter((quota) => !quota.closedAt);
    if (!open.length) throw new Error("Abra um período de cotas antes de efetivar alteração.");
    const cents = input.value.abs().mul(100);
    const base = cents.div(open.length).floor(); const remainder = cents.minus(base.mul(open.length)).toNumber();
    let remaining = input.value.abs();
    for (const [index, quota] of open.entries()) {
      const delta = input.value.isPositive() ? base.plus(index < remainder ? 1 : 0).div(100) : Decimal.min(remaining, line.kind === "REVENUE" ? quota.planned : quota.planned.minus(quota.consumed).minus(quota.blocked));
      remaining = remaining.minus(delta);
      const signed = input.value.isPositive() ? delta : delta.negated();
      await tx.update(planningQuotas).set({ planned: sql`${planningQuotas.planned} + ${signed.toString()}::numeric` }).where(eq(planningQuotas.id, quota.id));
      await tx.insert(planningQuotaEvents).values({ quotaId: quota.id, type: "LEGAL_ADJUSTMENT", effectiveAt: input.effectiveAt, value: signed, reason: input.reason, submissionKey: `${input.key}:quota:${quota.month}`, createdById: context.user.id });
    }
    if (remaining.greaterThan(0)) throw new Error("Cotas abertas insuficientes para a redução.");
  }
  const [movement] = await tx.insert(planningMovements).values({ lineId: line.id, value: input.value, effectiveAt: input.effectiveAt, reason: input.reason, legalText: input.legalText, legalActNumber: input.legalActNumber, createdById: context.user.id, idempotencyKey: input.key }).returning();
  if (piece.annualBudgetLawId && line.kind !== "TRANSFER") {
    const updated = line.kind === "REVENUE" ? await tx.update(planningForecasts).set({ estimatedValue: balance }).where(and(eq(planningForecasts.annualBudgetLawId, piece.annualBudgetLawId), eq(planningForecasts.code, line.code))).returning({ id: planningForecasts.id }) : await tx.update(planningFixations).set({ fixedValue: balance }).where(and(eq(planningFixations.annualBudgetLawId, piece.annualBudgetLawId), eq(planningFixations.code, line.code))).returning({ id: planningFixations.id });
    if (updated.length !== 1) throw new Error("Previsão/fixação canônica da LOA ausente ou ambígua.");
    await tx.update(planningBudgetLaws).set(line.kind === "REVENUE" ? { totalRevenue: sql`${planningBudgetLaws.totalRevenue} + ${input.value.toString()}::numeric` } : { totalExpense: sql`${planningBudgetLaws.totalExpense} + ${input.value.toString()}::numeric` }).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId));
  }
  if (piece.annualBudgetLawId) {
    const [command] = await tx.insert(planningIntegrationCommands).values({ type: "ACCOUNTING_BUDGET_CHANGE", sourceId: movement.id, idempotencyKey: `accounting:${input.key}`, payload: jsonValue({ instrumentId: piece.id, governmentEntityId: piece.governmentEntityId, lineId: line.id, fiscalYear: line.year, kind: line.kind, value: input.value.toFixed(2), effectiveAt: input.effectiveAt, legalActNumber: input.legalActNumber }) }).returning();
    await deliverPlanningAccountingCommand(tx, context, command.id);
  }
  return movement.id;
}

export async function finalizeLegalRevision(tx: PlanningTx, context: PlanningContext, piece: LegalInstrument, at: Date, act: string, reason: string) {
  await tx.update(planningInstruments).set({ revision: sql`${planningInstruments.revision} + 1` }).where(eq(planningInstruments.id, piece.id));
  return snapshotVersion(tx, context, piece.id, at, act, reason);
}
