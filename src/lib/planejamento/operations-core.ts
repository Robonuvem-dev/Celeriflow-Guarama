import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { planningInstrumentWhere, planningLineWhere, type PlanningContext } from "./access";
import { deliverPlanningAccountingCommand } from "./accounting-bridge";

export type PlanningTx = Prisma.TransactionClient;
export const jsonValue = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const contentHash = (value: unknown) => {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : input;
  return createHash("sha256").update(JSON.stringify(canonical(jsonValue(value)))).digest("hex");
};

export async function lockLegalInstrument(tx: PlanningTx, context: PlanningContext, id: string) {
  const visible = await tx.planningInstrument.findFirst({ where: { id, ...planningInstrumentWhere(context) } });
  if (!visible) throw new AccessError("Peça não encontrada neste escopo.", 404);
  await tx.$queryRaw`SELECT id FROM "PlanningInstrument" WHERE id = ${id} FOR UPDATE`;
  if (visible.multiYearPlanId) await tx.$queryRaw`SELECT id FROM "MultiYearPlan" WHERE id = ${visible.multiYearPlanId} FOR UPDATE`;
  if (visible.budgetGuidelineId) await tx.$queryRaw`SELECT id FROM "BudgetGuideline" WHERE id = ${visible.budgetGuidelineId} FOR UPDATE`;
  if (visible.annualBudgetLawId) await tx.$queryRaw`SELECT id FROM "AnnualBudgetLaw" WHERE id = ${visible.annualBudgetLawId} FOR UPDATE`;
  return tx.planningInstrument.findUniqueOrThrow({ where: { id }, include: { multiYearPlan: true, budgetGuideline: true, annualBudgetLaw: true, parent: { include: { parent: true } } } });
}
export type LegalInstrument = Awaited<ReturnType<typeof lockLegalInstrument>>;
export const canonicalPiece = (piece: LegalInstrument) => piece.multiYearPlan ?? piece.budgetGuideline ?? piece.annualBudgetLaw;

export async function planningAppropriationCode(tx: PlanningTx, piece: LegalInstrument, line: { year: number; code: string }) {
  const entity = await tx.governmentEntity.findUniqueOrThrow({ where: { id: piece.governmentEntityId }, select: { code: true } });
  return `${entity.code}:${line.year}:${line.code}`;
}

export async function planningProgramCatalog(tx: PlanningTx, piece: { multiYearPlanId: string | null; budgetGuidelineId: string | null; annualBudgetLawId: string | null }) {
  let ppaId = piece.multiYearPlanId;
  if (!ppaId && piece.budgetGuidelineId) ppaId = (await tx.budgetGuideline.findUniqueOrThrow({ where: { id: piece.budgetGuidelineId }, select: { multiYearPlanId: true } })).multiYearPlanId;
  if (!ppaId && piece.annualBudgetLawId) ppaId = (await tx.annualBudgetLaw.findUniqueOrThrow({ where: { id: piece.annualBudgetLawId }, select: { budgetGuideline: { select: { multiYearPlanId: true } } } })).budgetGuideline?.multiYearPlanId ?? null;
  return ppaId ? tx.programPPA.findMany({ where: { multiYearPlanId: ppaId }, include: { objectives: { include: { indicators: true } }, actions: { include: { goals: true } } }, orderBy: [{ code: "asc" }, { id: "asc" }] }) : [];
}

export async function assertWholePiece(tx: PlanningTx, context: PlanningContext, instrumentId: string) {
  if (!isSystemAdministrator(context.user) && await tx.planningBudgetLine.count({ where: { instrumentId, budgetUnitId: { notIn: context.user.allowedBudgetUnitIds } } })) throw new AccessError("Esta operação exige acesso a todas as unidades da peça.", 403);
}

export async function planningAudit(tx: PlanningTx, context: PlanningContext, id: string, action: string, payload: unknown) {
  await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, entityType: "PLANNING_INSTRUMENT", entityId: id, action, payload: jsonValue(payload) } });
}

export async function snapshotVersion(tx: PlanningTx, context: PlanningContext, instrumentId: string, effectiveAt: Date, legalActNumber: string, reason: string) {
  const piece = await tx.planningInstrument.findUniqueOrThrow({ where: { id: instrumentId }, include: { governmentEntity: true, multiYearPlan: true, budgetGuideline: { include: { priorities: true, risks: true } }, annualBudgetLaw: true, memories: true, waivers: true, fiscalRules: true, plannedWorks: true } });
  const existing = await tx.planningVersion.findUnique({ where: { instrumentId_number: { instrumentId, number: piece.revision } } });
  if (existing) return existing.id;
  const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId }, include: { budgetUnit: { include: { secretariat: true } }, resourceSource: true, revenueNature: true, expenseNature: true, program: { include: { objectives: { include: { indicators: true } } } }, action: true, movements: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] }, physicalEvents: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] }, quotas: { include: { events: true }, orderBy: { month: "asc" } } }, orderBy: [{ year: "asc" }, { code: "asc" }, { id: "asc" }] });
  const destinations = await tx.governmentEntity.findMany({ where: { id: { in: lines.flatMap((line) => line.destinationEntityId ? [line.destinationEntityId] : []) } }, select: { id: true, name: true } });
  const programs = await planningProgramCatalog(tx, piece);
  const documentLinks = await tx.planningDocumentLink.findMany({ where: { instrumentId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const sourceBindings = await tx.planningInstrumentSource.findMany({ where: { instrumentId }, include: { catalogEntry: true }, orderBy: { resourceSourceId: "asc" } });
  const annualPrograms = await tx.planningAnnualProgram.findMany({ where: { instrumentId }, orderBy: [{ year: "asc" }, { programId: "asc" }] });
  const legislativeLinks = await tx.planningLegislativeLink.findMany({ where: { instrumentId }, orderBy: { createdAt: "asc" } });
  const propositions = await tx.camProposicao.findMany({ where: { id: { in: legislativeLinks.flatMap((link) => link.propositionId ? [link.propositionId] : []) } } });
  const laws = await tx.camLei.findMany({ where: { id: { in: legislativeLinks.flatMap((link) => link.lawId ? [link.lawId] : []) } } });
  const snapshot = jsonValue({ piece: { ...piece, programs, documentLinks, sourceBindings, annualPrograms, legislativeLinks: legislativeLinks.map((link) => ({ ...link, proposition: propositions.find((proposal) => proposal.id === link.propositionId) ?? null, law: laws.find((law) => law.id === link.lawId) ?? null })) }, lines: lines.map((line) => ({ ...line, destinationEntity: destinations.find((entity) => entity.id === line.destinationEntityId) ?? null })) });
  const version = await tx.planningVersion.create({ data: { instrumentId, number: piece.revision, effectiveAt, legalActNumber, reason, snapshot, hash: contentHash(snapshot), createdById: context.user.id } });
  return version.id;
}

export async function linePosition(tx: PlanningTx, lineId: string, at?: Date) {
  const line = await tx.planningBudgetLine.findUniqueOrThrow({ where: { id: lineId } });
  const sum = await tx.planningLineMovement.aggregate({ where: { lineId, ...(at ? { effectiveAt: { lte: at } } : {}) }, _sum: { value: true } });
  return line.originalValue.plus(sum._sum.value ?? 0);
}

/** Caller holds the instrument lock. All legal effects use this command. */
export async function applyLineDelta(tx: PlanningTx, context: PlanningContext, piece: LegalInstrument, input: { lineId: string; value: Prisma.Decimal; effectiveAt: Date; reason: string; legalText: string; legalActNumber: string; key: string; allowBlocked?: boolean; reservationBatchId?: string }) {
  const line = await tx.planningBudgetLine.findFirst({ where: { AND: [planningLineWhere(context), { id: input.lineId, instrumentId: piece.id }] } });
  if (!line) throw new AccessError("Previsão não encontrada nas unidades autorizadas.", 403);
  if (input.value.isZero()) throw new Error("Alteração sem valor.");
  const canonical = canonicalPiece(piece);
  const year = input.effectiveAt.getUTCFullYear();
  if (!Number.isFinite(input.effectiveAt.getTime()) || year > piece.endYear || input.effectiveAt.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10) || canonical?.sanctionedAt && input.effectiveAt < canonical.sanctionedAt) throw new Error("Ato fora da vigência legal da peça.");
  if (piece.annualBudgetLaw && !["Preparação", "Aberto"].includes((await tx.financialYear.findUniqueOrThrow({ where: { id: piece.annualBudgetLaw.financialYearId } })).status)) throw new Error("O exercício financeiro não está disponível para alterações.");
  const existing = await tx.planningLineMovement.findUnique({ where: { idempotencyKey: input.key } });
  if (existing) {
    if (existing.lineId !== line.id || !existing.value.equals(input.value) || existing.effectiveAt.getTime() !== input.effectiveAt.getTime() || existing.legalActNumber !== input.legalActNumber || existing.reason !== input.reason || existing.legalText !== input.legalText) throw new Error("Solicitação repetida com dados diferentes.");
    return existing.id;
  }
  if (line.amendmentBlocked && !input.allowBlocked) throw new Error("Dotação bloqueada para emendas.");
  const history = await tx.planningLineMovement.findMany({ where: { lineId: line.id } });
  const days = new Map<number, Prisma.Decimal>();
  for (const row of [...history, { effectiveAt: input.effectiveAt, value: input.value }]) days.set(row.effectiveAt.getTime(), (days.get(row.effectiveAt.getTime()) ?? new Prisma.Decimal(0)).plus(row.value));
  let balance = line.originalValue;
  for (const [, delta] of [...days].sort(([a], [b]) => a - b)) { balance = balance.plus(delta); if (balance.isNegative()) throw new Error("A alteração produziria saldo negativo em uma data do histórico."); }
  const reserved = await tx.planningCreditLine.aggregate({ where: { lineId: line.id, batch: { status: { in: ["DRAFT", "APPROVED", "SANCTIONED", "PUBLISHED"] } }, ...(input.reservationBatchId ? { batchId: { not: input.reservationBatchId } } : {}) }, _sum: { reserved: true } });
  if (balance.lessThan(reserved._sum.reserved ?? 0)) throw new Error("Saldo reservado por outra prévia de crédito.");
  if (line.appropriationId) {
    await tx.$queryRaw`SELECT id FROM "BudgetAppropriation" WHERE id = ${line.appropriationId} FOR UPDATE`;
    const appropriation = await tx.budgetAppropriation.findUniqueOrThrow({ where: { id: line.appropriationId } });
    const active = await tx.budgetReservation.findMany({ where: { appropriationId: appropriation.id, status: "Ativa" }, select: { valueDecimal: true, value: true } });
    const reservedPurchases = active.reduce((sum, row) => sum.plus(row.valueDecimal ?? new Prisma.Decimal(row.value)), new Prisma.Decimal(0));
    const consumed = appropriation.committedValueDecimal ?? new Prisma.Decimal(appropriation.committedValue);
    if (balance.lessThan(consumed.plus(reservedPurchases).plus(reserved._sum.reserved ?? 0))) throw new Error("A redução excede o saldo disponível da dotação implantada.");
    await tx.budgetAppropriation.update({ where: { id: appropriation.id }, data: { updatedValueDecimal: balance, updatedValue: balance.toNumber() } });
    await tx.budgetMovement.create({ data: { appropriationId: appropriation.id, date: input.effectiveAt, type: input.value.isPositive() ? "Suplementação" : "Anulação", valueDecimal: input.value.abs(), justification: input.reason, sourceModule: "PLANEJAMENTO", sourceType: "LEGAL_CHANGE", sourceId: input.key, idempotencyKey: `planning:${input.key}`, eventType: "PLANNING_LEGAL_CHANGE" } });
  }
  const quotas = await tx.planningQuota.findMany({ where: { lineId: line.id }, orderBy: { month: "asc" } });
  if (quotas.length) {
    const open = quotas.filter((quota) => !quota.closedAt);
    if (!open.length) throw new Error("Abra um período de cotas antes de efetivar alteração.");
    const cents = input.value.abs().mul(100);
    const base = cents.div(open.length).floor(); const remainder = cents.minus(base.mul(open.length)).toNumber();
    let remaining = input.value.abs();
    for (const [index, quota] of open.entries()) {
      const delta = input.value.isPositive() ? base.plus(index < remainder ? 1 : 0).div(100) : Prisma.Decimal.min(remaining, line.kind === "REVENUE" ? quota.planned : quota.planned.minus(quota.consumed).minus(quota.blocked));
      remaining = remaining.minus(delta);
      const signed = input.value.isPositive() ? delta : delta.negated();
      await tx.planningQuota.update({ where: { id: quota.id }, data: { planned: { increment: signed } } });
      await tx.planningQuotaEvent.create({ data: { quotaId: quota.id, type: "LEGAL_ADJUSTMENT", effectiveAt: input.effectiveAt, value: signed, reason: input.reason, submissionKey: `${input.key}:quota:${quota.month}`, createdById: context.user.id } });
    }
    if (remaining.greaterThan(0)) throw new Error("Cotas abertas insuficientes para a redução.");
  }
  const movement = await tx.planningLineMovement.create({ data: { lineId: line.id, value: input.value, effectiveAt: input.effectiveAt, reason: input.reason, legalText: input.legalText, legalActNumber: input.legalActNumber, createdById: context.user.id, idempotencyKey: input.key } });
  if (piece.annualBudgetLawId && line.kind !== "TRANSFER") {
    const updated = line.kind === "REVENUE" ? await tx.annualBudgetRevenueForecast.updateMany({ where: { annualBudgetLawId: piece.annualBudgetLawId, code: line.code }, data: { estimatedValue: balance } }) : await tx.annualBudgetExpenseFixation.updateMany({ where: { annualBudgetLawId: piece.annualBudgetLawId, code: line.code }, data: { fixedValue: balance } });
    if (updated.count !== 1) throw new Error("Previsão/fixação canônica da LOA ausente ou ambígua.");
    await tx.annualBudgetLaw.update({ where: { id: piece.annualBudgetLawId }, data: line.kind === "REVENUE" ? { totalRevenue: { increment: input.value } } : { totalExpense: { increment: input.value } } });
  }
  if (piece.annualBudgetLawId) {
    const command = await tx.planningIntegrationCommand.create({ data: { type: "ACCOUNTING_BUDGET_CHANGE", sourceId: movement.id, idempotencyKey: `accounting:${input.key}`, payload: jsonValue({ instrumentId: piece.id, governmentEntityId: piece.governmentEntityId, lineId: line.id, fiscalYear: line.year, kind: line.kind, value: input.value.toFixed(2), effectiveAt: input.effectiveAt, legalActNumber: input.legalActNumber }) } });
    await deliverPlanningAccountingCommand(tx, context, command.id);
  }
  return movement.id;
}

export async function finalizeLegalRevision(tx: PlanningTx, context: PlanningContext, piece: LegalInstrument, at: Date, act: string, reason: string) {
  await tx.planningInstrument.update({ where: { id: piece.id }, data: { revision: { increment: 1 } } });
  return snapshotVersion(tx, context, piece.id, at, act, reason);
}
