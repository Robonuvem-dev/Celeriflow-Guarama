import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { documents, taxpayers } from "@/db/schema/registry";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxActiveDebts, taxPayments, taxIntegrationEvents } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { collectionPortfolios, collectionPortfolioItems, collectionActions, collectionActionEvents, installmentRules, installmentAgreements, installmentDebts, installmentQuotas, installmentPaymentAllocations, installmentEvents, taxpayerPortalAccesses, benefitRules, benefitGrants, prizeDraws, prizeCoupons, prizeExecutions, prizeWinners } from "@/db/schema/tax-collection-operations";
import { collectionJson as json, collectionRow, lockCollectionOperation } from "@/db/repositories/tax-collection-operations/shared";
import type { InstallmentCreationRecord, PrizeExecutionRecord } from "@/lib/contracts/tax-collection-operations";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import type { TaxActor } from "./index";
import { postTaxAssessmentAdjustment } from "./accrual-accounting";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, synchronizeAssessmentDebt, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { allocateInstallmentPayment, calculateBenefit, collectionRanking, executeDeterministicDraw, splitInstallmentAmount, TributarioS8Error } from "./s8-engine";

type Actor = { usuarioId: string };
const code = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const money = (value: number | string | Decimal) => new Decimal(String(value)).toDecimalPlaces(2);
const plusMonths = (date: Date, amount: number, day: number) => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12));
  result.setUTCDate(Math.min(day, new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()));
  return result;
};

export async function createCollectionPortfolio(db: DatabaseConnection, actor: Actor, input: { name: string; profileId?: string; taxpayerIds?: string[] }) {
  return withDatabaseTransaction(db, async tx => {
    const assessments = await tx.select().from(taxAssessments).where(and(input.taxpayerIds?.length ? inArray(taxAssessments.taxpayerId, input.taxpayerIds) : undefined, notInArray(taxAssessments.status, ["Pago", "Cancelado"]))).orderBy(asc(taxAssessments.createdAt)).limit(200);
    const debts = await tx.select().from(taxActiveDebts).where(and(input.taxpayerIds?.length ? inArray(taxActiveDebts.taxpayerId, input.taxpayerIds) : undefined, notInArray(taxActiveDebts.status, ["Paga", "Cancelada"]))).orderBy(asc(taxActiveDebts.createdAt)).limit(200);
    const activeAssessmentIds = new Set(debts.map(row => row.assessmentId).filter(Boolean));
    const items = [
      ...assessments.filter(row => !activeAssessmentIds.has(row.id)).map(row => ({ taxpayerId: row.taxpayerId, sourceType: "LANCAMENTO", sourceId: row.id, originalDecimal: new Decimal(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue), outstandingDecimal: new Decimal(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue), dueDate: row.competence })),
      ...debts.map(row => ({ taxpayerId: row.taxpayerId, sourceType: "DIVIDA_ATIVA_LEITURA", sourceId: row.id, originalDecimal: new Decimal(row.originalValueDecimal ?? row.originalValue), outstandingDecimal: new Decimal(row.updatedValueDecimal ?? row.updatedValue), dueDate: null })),
    ];
    if (!items.length) throw new TributarioS8Error("Nenhum débito elegível foi encontrado para a seleção.");
    const portfolio = collectionRow(await tx.insert(collectionPortfolios).values({ name: input.name.trim() || "Carteira de cobrança", profileId: input.profileId || null, selectionMode: input.taxpayerIds?.length ? "CONTRIBUINTES" : "AUTOMATICA", selectionSnapshot: json({ taxpayerIds: input.taxpayerIds ?? [], selectedAt: new Date(), sources: { assessments: assessments.length, activeDebtReadOnly: debts.length } }), createdByUsuarioId: actor.usuarioId }).returning());
    const persisted = await tx.insert(collectionPortfolioItems).values(items.map(item => ({ ...item, portfolioId: portfolio.id }))).returning();
    return { ...portfolio, items: persisted };
  });
}

export async function scheduleCollectionAction(db: DatabaseConnection, actor: Actor, input: { portfolioId: string; portfolioItemId?: string; taxpayerId: string; actionType: string; modality: string; channel: string; scheduledAt?: Date }) {
  return withDatabaseTransaction(db, async tx => {
    const action = collectionRow(await tx.insert(collectionActions).values({ portfolioId: input.portfolioId, portfolioItemId: input.portfolioItemId || null, taxpayerId: input.taxpayerId, actionType: input.actionType, modality: input.modality, channel: input.channel, scheduledAt: input.scheduledAt ?? new Date(), createdByUsuarioId: actor.usuarioId }).returning());
    await tx.insert(collectionActionEvents).values({ actionId: action.id, eventType: "AGENDADA", description: `Ação ${input.actionType} agendada pelo canal ${input.channel}.`, actorUsuarioId: actor.usuarioId, payload: json({ externalDelivery: input.channel === "DTE" ? "INTERNAL_ADAPTER" : "PENDING_PROVIDER" }) });
    return action;
  });
}

export async function completeCollectionAction(db: DatabaseConnection, actor: Actor, input: { actionId: string; resultCode: string; description: string; nextActionAt?: Date }) {
  return withDatabaseTransaction(db, async tx => {
    const action = collectionRow(await tx.update(collectionActions).set({ status: "REALIZADA", performedAt: new Date(), resultCode: input.resultCode, resultDescription: input.description, nextActionAt: input.nextActionAt || null }).where(eq(collectionActions.id, input.actionId)).returning());
    await tx.insert(collectionActionEvents).values({ actionId: action.id, eventType: "RESULTADO", description: input.description, payload: json({ resultCode: input.resultCode, nextActionAt: input.nextActionAt }), actorUsuarioId: actor.usuarioId });
    return action;
  });
}

export async function collectionDashboard(db: DatabaseExecutor) {
  const items = await db.select().from(collectionPortfolioItems);
  const actions = await db.select().from(collectionActions).where(eq(collectionActions.status, "REALIZADA"));
  const grouped = new Map<string, { outstanding: number; overdueDays: number; successfulContacts: number }>();
  const today = Date.now();
  for (const item of items) {
    const current = grouped.get(item.taxpayerId) ?? { outstanding: 0, overdueDays: 0, successfulContacts: 0 };
    current.outstanding += Number(item.outstandingDecimal);
    current.overdueDays = Math.max(current.overdueDays, item.dueDate ? Math.floor((today - item.dueDate.getTime()) / 86400000) : 0);
    current.successfulContacts += actions.filter(action => action.portfolioItemId === item.id && ["ACORDO", "CONTATO", "PAGAMENTO"].includes(action.resultCode ?? "")).length;
    grouped.set(item.taxpayerId, current);
  }
  return collectionRanking([...grouped].map(([taxpayerId, values]) => ({ taxpayerId, ...values })));
}

export function simulateInstallment(input: { total: number | string | Decimal; count: number; discount?: number | string | Decimal; fees?: number | string | Decimal; dueDay: number }) {
  const original = money(input.total), discount = money(input.discount ?? 0), fees = money(input.fees ?? 0);
  const total = original.minus(discount).plus(fees).toDecimalPlaces(2);
  if (total.lessThanOrEqualTo(0)) throw new TributarioS8Error("O total do acordo deve ser positivo.");
  return { original, discount, fees, total, quotas: splitInstallmentAmount(total, input.count), dueDay: input.dueDay };
}

type AgreementInput = { taxpayerId: string; ruleId: string; total: number; count: number; dueDay: number; discount?: number; fees?: number; sourceType: string; sourceId: string; originLabel: string };
async function createAgreement(tx: DatabaseTransaction, actor: Actor, input: AgreementInput): Promise<InstallmentCreationRecord> {
  const taxpayer = (await tx.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1))[0];
  const rule = (await tx.select().from(installmentRules).where(eq(installmentRules.id, input.ruleId)).limit(1))[0];
  if (!taxpayer || !rule?.active) throw new TributarioS8Error("Contribuinte ou regra de parcelamento indisponível.");
  if (input.count < rule.minInstallments || input.count > rule.maxInstallments) throw new TributarioS8Error("Quantidade de parcelas fora da regra vigente.");
  const simulation = simulateInstallment(input);
  const firstDue = new Date();
  const agreement = collectionRow(await tx.insert(installmentAgreements).values({ agreementNumber: code("PARC"), taxpayerId: taxpayer.id, ruleId: rule.id, installmentCount: input.count, dueDay: input.dueDay, originalDebtDecimal: simulation.original, discountDecimal: simulation.discount, feesDecimal: simulation.fees, totalAgreementDecimal: simulation.total, balanceDecimal: simulation.total, simulationSnapshot: json({ ...simulation, quotas: simulation.quotas.map(String), rule: { id: rule.id, legalReference: rule.legalReference } }), createdByUsuarioId: actor.usuarioId }).returning());
  const debts = await tx.insert(installmentDebts).values({ agreementId: agreement.id, sourceType: input.sourceType, sourceId: input.sourceId, originLabel: input.originLabel, originalAmountDecimal: simulation.original }).returning();
  await tx.insert(installmentQuotas).values(simulation.quotas.map((amount, index) => ({ agreementId: agreement.id, quotaNumber: index + 1, dueDate: plusMonths(firstDue, index + 1, input.dueDay), originalDecimal: amount, balanceDecimal: amount })));
  const events = await tx.insert(installmentEvents).values({ agreementId: agreement.id, eventType: "ADESAO", description: `${input.count} cotas geradas com distribuição exata dos centavos.`, actorUsuarioId: actor.usuarioId, payload: json({ total: simulation.total, quotas: simulation.quotas.map(String) }) }).returning();
  const quotas = await tx.select().from(installmentQuotas).where(eq(installmentQuotas.agreementId, agreement.id)).orderBy(asc(installmentQuotas.quotaNumber));
  return { ...agreement, debts, quotas, events };
}

export async function createInstallmentAgreement(db: DatabaseConnection, actor: Actor, input: AgreementInput) {
  return withDatabaseTransaction(db, tx => createAgreement(tx, actor, input));
}

export async function applyInstallmentPayment(db: DatabaseConnection, actor: Actor, input: { agreementId: string; paymentKey: string; amount: number; paymentMode?: string }) {
  return withDatabaseTransaction(db, async tx => {
    const agreement = (await tx.select().from(installmentAgreements).where(eq(installmentAgreements.id, input.agreementId)).for("update"))[0];
    if (!agreement || !["ATIVO", "REATIVADO"].includes(agreement.status)) throw new TributarioS8Error("Parcelamento indisponível para pagamento.");
    const quotas = await tx.select().from(installmentQuotas).where(eq(installmentQuotas.agreementId, agreement.id)).orderBy(asc(installmentQuotas.quotaNumber));
    const allocations = await tx.select().from(installmentPaymentAllocations).where(and(eq(installmentPaymentAllocations.agreementId, agreement.id), eq(installmentPaymentAllocations.paymentKey, input.paymentKey)));
    if (allocations.length) return { ...agreement, quotas, allocations };
    const allocation = allocateInstallmentPayment(quotas.map(row => ({ id: row.id, quotaNumber: row.quotaNumber, balance: row.balanceDecimal })), input.amount);
    for (const row of allocation.allocations.filter(item => item.allocated.greaterThan(0))) {
      await tx.update(installmentQuotas).set({ paidDecimal: sql`${installmentQuotas.paidDecimal} + ${row.allocated.toString()}::numeric`, balanceDecimal: row.balanceAfter, status: row.status }).where(eq(installmentQuotas.id, row.id!));
      await tx.insert(installmentPaymentAllocations).values({ agreementId: agreement.id, quotaId: row.id!, paymentKey: input.paymentKey, amountDecimal: row.allocated, paymentDate: new Date(), paymentMode: input.paymentMode ?? "FORA_DA_PARCELA" });
    }
    const updated = collectionRow(await tx.update(installmentAgreements).set({ paidDecimal: agreement.totalAgreementDecimal.minus(allocation.totalBalance), balanceDecimal: allocation.totalBalance, status: allocation.totalBalance.equals(0) ? "QUITADO" : agreement.status }).where(eq(installmentAgreements.id, agreement.id)).returning());
    await tx.insert(installmentEvents).values({ agreementId: agreement.id, eventType: "PAGAMENTO", description: `Pagamento de R$ ${money(input.amount).toFixed(2)} alocado nas cotas mais antigas.`, actorUsuarioId: actor.usuarioId, payload: json({ paymentKey: input.paymentKey, allocation: allocation.allocations.map(row => ({ quota: row.quotaNumber, allocated: row.allocated, balance: row.balanceAfter })) }) });
    return { ...updated, quotas: await tx.select().from(installmentQuotas).where(eq(installmentQuotas.agreementId, agreement.id)).orderBy(asc(installmentQuotas.quotaNumber)), allocations: await tx.select().from(installmentPaymentAllocations).where(eq(installmentPaymentAllocations.agreementId, agreement.id)), events: await tx.select().from(installmentEvents).where(eq(installmentEvents.agreementId, agreement.id)) };
  });
}

export async function reviseInstallmentOrigin(db: DatabaseConnection, actor: Actor, input: { agreementId: string; debtId: string; revisedAmount: number; reason: string }) {
  return withDatabaseTransaction(db, async tx => {
    const agreement = (await tx.select().from(installmentAgreements).where(eq(installmentAgreements.id, input.agreementId)).for("update"))[0];
    const debts = agreement ? await tx.select().from(installmentDebts).where(eq(installmentDebts.agreementId, agreement.id)) : [];
    const debt = debts.find(row => row.id === input.debtId);
    if (!agreement || !debt) throw new TributarioS8Error("Origem do parcelamento não encontrada.");
    if (!input.reason.trim()) throw new TributarioS8Error("Informe a justificativa da revisão.");
    const previous = debt.revisedAmountDecimal ?? debt.originalAmountDecimal, revised = money(input.revisedAmount), delta = revised.minus(previous);
    const quotas = await tx.select().from(installmentQuotas).where(eq(installmentQuotas.agreementId, agreement.id)).orderBy(desc(installmentQuotas.quotaNumber));
    const lastOpen = quotas.find(row => row.status !== "QUITADA");
    if (!lastOpen || lastOpen.balanceDecimal.plus(delta).lessThan(0)) throw new TributarioS8Error("A revisão é incompatível com o saldo das cotas.");
    await tx.update(installmentDebts).set({ revisedAmountDecimal: revised }).where(eq(installmentDebts.id, debt.id));
    await tx.update(installmentQuotas).set({ originalDecimal: lastOpen.originalDecimal.plus(delta), balanceDecimal: lastOpen.balanceDecimal.plus(delta) }).where(eq(installmentQuotas.id, lastOpen.id));
    const updated = collectionRow(await tx.update(installmentAgreements).set({ originalDebtDecimal: agreement.originalDebtDecimal.plus(delta), totalAgreementDecimal: agreement.totalAgreementDecimal.plus(delta), balanceDecimal: agreement.balanceDecimal.plus(delta) }).where(eq(installmentAgreements.id, agreement.id)).returning());
    await tx.insert(installmentEvents).values({ agreementId: agreement.id, eventType: "REVISAO_ORIGEM", description: input.reason.trim(), actorUsuarioId: actor.usuarioId, payload: json({ debtId: debt.id, previous, revised, delta }) });
    return { ...updated, quotas: await tx.select().from(installmentQuotas).where(eq(installmentQuotas.agreementId, agreement.id)).orderBy(asc(installmentQuotas.quotaNumber)), debts: await tx.select().from(installmentDebts).where(eq(installmentDebts.agreementId, agreement.id)) };
  });
}

export async function reparcelInstallment(db: DatabaseConnection, actor: Actor, input: { agreementId: string; count: number; dueDay: number }) {
  return withDatabaseTransaction(db, async tx => {
    const parent = (await tx.select().from(installmentAgreements).where(eq(installmentAgreements.id, input.agreementId)).for("update"))[0];
    if (!parent || parent.balanceDecimal.lessThanOrEqualTo(0) || parent.status === "CANCELADO") throw new TributarioS8Error("Acordo sem saldo elegível para reparcelamento.");
    const child = await createAgreement(tx, actor, { taxpayerId: parent.taxpayerId, ruleId: parent.ruleId, total: Number(parent.balanceDecimal), count: input.count, dueDay: input.dueDay, sourceType: "REPARCELAMENTO", sourceId: parent.id, originLabel: `Saldo do acordo ${parent.agreementNumber}` });
    await tx.update(installmentAgreements).set({ parentAgreementId: parent.id, agreementType: "REPARCELAMENTO" }).where(eq(installmentAgreements.id, child.id));
    await tx.insert(installmentEvents).values({ agreementId: child.id, eventType: "ORIGEM_REPARCELAMENTO", description: `Reparcelamento do saldo de ${parent.agreementNumber}.`, actorUsuarioId: actor.usuarioId });
    await tx.update(installmentAgreements).set({ status: "REPARCELADO" }).where(eq(installmentAgreements.id, parent.id));
    await tx.insert(installmentEvents).values({ agreementId: parent.id, eventType: "REPARCELAMENTO", description: `Saldo transferido para ${child.agreementNumber}.`, actorUsuarioId: actor.usuarioId });
    return child;
  });
}

export async function changeInstallmentStatus(db: DatabaseConnection, actor: Actor, input: { agreementId: string; action: "ROMPER" | "REATIVAR" | "CANCELAR"; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS8Error("Informe a justificativa.");
  return withDatabaseTransaction(db, async tx => {
    const now = new Date();
    const result = collectionRow(await tx.update(installmentAgreements).set({ status: input.action === "ROMPER" ? "ROMPIDO" : input.action === "REATIVAR" ? "REATIVADO" : "CANCELADO", brokenAt: input.action === "ROMPER" ? now : undefined, reactivatedAt: input.action === "REATIVAR" ? now : undefined, cancelledAt: input.action === "CANCELAR" ? now : undefined }).where(eq(installmentAgreements.id, input.agreementId)).returning());
    await tx.insert(installmentEvents).values({ agreementId: result.id, eventType: input.action, description: input.reason.trim(), actorUsuarioId: actor.usuarioId });
    return result;
  });
}

export async function grantPortalAccess(db: DatabaseConnection, actor: Actor, taxpayerId: string) {
  return withDatabaseTransaction(db, async tx => {
    collectionRow(await tx.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.id, taxpayerId)).limit(1));
    const scopes = json(["EXTRATO", "DAM", "CERTIDOES", "IPTU", "PARCELAMENTO", "DIVIDA", "PROCESSOS", "EMPRESA", "IMOVEL", "ITBI", "NOTIFICACOES", "PAGAMENTOS", "DOCUMENTOS", "ALVARAS", "AUTENTICIDADE"]);
    return collectionRow(await tx.insert(taxpayerPortalAccesses).values({ usuarioId: actor.usuarioId, taxpayerId, grantedByUsuarioId: actor.usuarioId, scopes }).onConflictDoUpdate({ target: [taxpayerPortalAccesses.usuarioId, taxpayerPortalAccesses.taxpayerId], set: { status: "ATIVO", revokedAt: null, scopes } }).returning());
  });
}

export async function createBenefitRule(db: DatabaseConnection, actor: Actor, input: { code: string; name: string; benefitType: "CREDITO" | "REDUCAO" | "RENUNCIA"; legalReference: string; value: number; valueMode: "PERCENT" | "FIXED"; effectiveFrom: Date; effectiveUntil?: Date }) {
  if (!input.legalReference.trim()) throw new TributarioS8Error("A referência legal é obrigatória.");
  if (!input.code.trim() || !input.name.trim() || !["CREDITO", "REDUCAO", "RENUNCIA"].includes(input.benefitType) || !["PERCENT", "FIXED"].includes(input.valueMode)) throw new TributarioS8Error("Identificação ou tipo do benefício inválido.");
  if (!Number.isFinite(input.value) || input.value <= 0 || (input.valueMode === "PERCENT" && input.value > 100)) throw new TributarioS8Error("Valor do benefício inválido.");
  if (!Number.isFinite(input.effectiveFrom.getTime()) || (input.effectiveUntil && (!Number.isFinite(input.effectiveUntil.getTime()) || input.effectiveUntil < input.effectiveFrom))) throw new TributarioS8Error("Vigência do benefício inválida.");
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(benefitRules).values({ code: input.code.trim(), name: input.name.trim(), benefitType: input.benefitType, legalReference: input.legalReference.trim(), eligibility: { mode: "ANALISE_INDIVIDUAL" }, calculation: { value: input.value, valueMode: input.valueMode }, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil || null, createdByUsuarioId: actor.usuarioId }).returning()));
}

export async function grantBenefit(db: DatabaseConnection, actor: TaxActor, input: { ruleId: string; taxpayerId: string; sourceType: string; sourceId: string; originalAmount: number; reason: string; documentId?: string }) {
  if (input.sourceType !== "TAX_ASSESSMENT" || !input.reason.trim()) throw new TributarioS8Error("Informe o lançamento e o fundamento da concessão.");
  const original = money(input.originalAmount);
  if (!original.isFinite() || original.lte(0)) throw new TributarioS8Error("Valor original do benefício inválido.");
  const request = { originalAmount: original.toFixed(2), reason: input.reason.trim(), documentId: input.documentId?.trim() || null };
  return withDatabaseTransaction(db, async tx => {
    const assessment = collectionRow(await tx.select().from(taxAssessments).where(eq(taxAssessments.id, input.sourceId)).limit(1));
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (assessment.taxpayerId !== input.taxpayerId) throw new TributarioS8Error("Contribuinte diferente do titular do lançamento.");
    const key = { ruleId: input.ruleId, taxpayerId: input.taxpayerId, sourceType: input.sourceType, sourceId: input.sourceId };
    await lockCollectionOperation(tx, `BENEFIT:${JSON.stringify(key)}`);
    const existing = (await tx.select().from(benefitGrants).where(and(eq(benefitGrants.ruleId, key.ruleId), eq(benefitGrants.taxpayerId, key.taxpayerId), eq(benefitGrants.sourceType, key.sourceType), eq(benefitGrants.sourceId, key.sourceId))).limit(1))[0];
    if (existing) {
      const stored = taxScopeSnapshot(taxScopeSnapshot(existing.calculationSnapshot).request);
      if (existing.status !== "CONCEDIDO" || Object.entries(request).some(([field, value]) => stored[field] !== value)) throw new TributarioS8Error("Benefício já registrado com outros dados.");
      return existing;
    }
    const now = new Date();
    const year = await resolveTaxFinancialYear(tx, now.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, now);
    const current = collectionRow(await tx.select().from(taxAssessments).where(eq(taxAssessments.id, input.sourceId)).for("update"));
    if (["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"].includes(current.status)) throw new TributarioS8Error("Lançamento indisponível para concessão de benefício.");
    const total = current.finalValueDecimal ?? current.originalValueDecimal;
    if (!total) throw new TributarioS8Error("Lançamento sem valor decimal conciliado.");
    let paid = await taxAssessmentCompensatedValue(tx, current.id);
    const guides = await tx.select().from(taxGuides).where(eq(taxGuides.assessmentId, current.id));
    for (const guide of guides) {
      const payments = await tx.select().from(taxPayments).where(and(eq(taxPayments.guideId, guide.id), eq(taxPayments.status, "Confirmado")));
      const collected = payments.reduce((sum, payment) => { if (!payment.amountPaidDecimal) throw new TributarioS8Error("Pagamento sem valor decimal conciliado."); return sum.plus(payment.amountPaidDecimal); }, new Decimal(0));
      paid = paid.plus(collected);
      if (guide.status !== "Cancelada" && (guide.totalValueDecimal ?? money(guide.totalValue)).gt(collected)) throw new TributarioS8Error("Cancele as guias abertas antes de conceder o benefício.");
    }
    const balance = total.minus(paid);
    if (!balance.eq(original)) throw new TributarioS8Error("O saldo do lançamento mudou; atualize o valor da concessão.");
    const rule = (await tx.select().from(benefitRules).where(eq(benefitRules.id, input.ruleId)).limit(1))[0];
    if (!rule?.active || rule.effectiveFrom > now || (rule.effectiveUntil && rule.effectiveUntil < now)) throw new TributarioS8Error("Regra de benefício fora da vigência.");
    if (rule.benefitType !== "CREDITO" && rule.benefitType !== "REDUCAO" && rule.benefitType !== "RENUNCIA") throw new TributarioS8Error("Tipo de benefício inválido.");
    if (request.documentId) {
      const document = (await tx.select().from(documents).where(eq(documents.id, request.documentId)).limit(1))[0];
      if (document?.status !== "Válido") throw new TributarioS8Error("Documento GED da concessão não está válido.");
    }
    const config = taxScopeSnapshot(rule.calculation);
    if ((config.valueMode !== "PERCENT" && config.valueMode !== "FIXED") || (typeof config.value !== "number" && typeof config.value !== "string")) throw new TributarioS8Error("Cálculo do benefício não está configurado.");
    const configuredValue = new Decimal(String(config.value));
    if (!configuredValue.isFinite() || configuredValue.lte(0) || (config.valueMode === "PERCENT" && configuredValue.gt(100))) throw new TributarioS8Error("Valor configurado do benefício inválido.");
    const result = calculateBenefit({ amount: balance, type: rule.benefitType, value: config.value, valueMode: config.valueMode });
    const applied = balance.minus(result.finalAmount);
    if (applied.lte(0)) throw new TributarioS8Error("O benefício deve reduzir o saldo do lançamento.");
    const finalValue = total.minus(applied);
    await postTaxAssessmentAdjustment(tx, actor, { assessmentId: current.id, date: now, delta: applied.negated(), kind: "BENEFIT", idempotencyKey: `BENEFIT:${current.id}:${rule.id}:ACCOUNTING`, reason: request.reason });
    const grant = collectionRow(await tx.insert(benefitGrants).values({ ...key, originalAmountDecimal: balance, creditDecimal: result.credit, reductionDecimal: result.reduction, renunciationDecimal: result.renunciation, finalAmountDecimal: result.finalAmount, calculationSnapshot: json({ ...scope, operationFinancialYearId: year.id, request, rule: { id: rule.id, code: rule.code, legalReference: rule.legalReference, calculation: rule.calculation }, result, oldValue: total.toFixed(2), newValue: finalValue.toFixed(2), effect: "REDUCAO_DEBITO_SEM_CAIXA" }), grantedByUsuarioId: actor.usuarioId, grantedAt: now }).returning());
    const entry = collectionRow(await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: current.id, category: "CREDIT_EVENT", title: `Benefício: ${rule.name}`, status: "ATIVO", source: "BENEFICIO", actorUsuarioId: actor.usuarioId, documentId: request.documentId, data: json({ ...scope, eventType: "BENEFICIO", grantId: grant.id, ruleId: rule.id, legalReference: rule.legalReference, amount: applied.toFixed(2), oldValue: total.toFixed(2), newValue: finalValue.toFixed(2), reducesAssessmentValue: true, reason: request.reason }) }).returning());
    await tx.update(taxAssessments).set({ finalValueDecimal: finalValue, status: finalValue.eq(paid) ? "Extinto" : "Revisado", calculationSnapshot: json({ ...taxScopeSnapshot(current.calculationSnapshot), currentValue: finalValue.toFixed(2), lastBenefitGrantId: grant.id }) }).where(eq(taxAssessments.id, current.id));
    await synchronizeAssessmentDebt(tx, actor, current.id);
    await tx.insert(taxIntegrationEvents).values({ integrationCode: "FISCAL_ENGINE", eventType: "BENEFIT_GRANTED", idempotencyKey: `BENEFIT:${grant.id}`, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: current.taxpayerId, payload: json({ ...scope, assessmentId: current.id, grantId: grant.id }), result: { registryEntryId: entry.id, amount: applied.toFixed(2), renunciation: result.renunciation.toFixed(2) }, processedAt: now });
    await tx.insert(taxAuditLogs).values({ action: "GRANT_BENEFIT", entityType: "TaxBenefitGrant", entityId: grant.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ ...scope, assessmentId: current.id, registryEntryId: entry.id, amount: applied.toFixed(2), reason: request.reason }) });
    return grant;
  });
}

export async function createPrizeDraw(db: DatabaseConnection, actor: Actor, input: { name: string; year: number; drawNumber: number; scheduledAt: Date; winnerCount: number; technicalSeed: string; requiresPayment?: boolean; officialActReference?: string }) {
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(prizeDraws).values({ slug: `${input.year}-${input.drawNumber}-${randomUUID().slice(0, 6)}`, name: input.name, year: input.year, drawNumber: input.drawNumber, scheduledAt: input.scheduledAt, eligibilityRules: { sourceRequired: true, status: "CONFIGURADA" }, requiresPayment: input.requiresPayment ?? false, taxpayerTypes: ["PF", "PJ"], winnerCount: input.winnerCount, technicalSeed: input.technicalSeed, officialActReference: input.officialActReference || null, createdByUsuarioId: actor.usuarioId }).returning()));
}

export async function issuePrizeCoupon(db: DatabaseConnection, input: { drawId: string; taxpayerId: string; sourceDocumentType: "GUIA" | "DOCUMENTO"; sourceDocumentId: string }) {
  return withDatabaseTransaction(db, async tx => {
    const draw = (await tx.select().from(prizeDraws).where(eq(prizeDraws.id, input.drawId)).for("update"))[0];
    if (!draw) throw new TributarioS8Error("Sorteio não encontrado.");
    if (input.sourceDocumentType === "GUIA") {
      const guide = (await tx.select({ guide: taxGuides, taxpayerId: taxAssessments.taxpayerId }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).where(eq(taxGuides.id, input.sourceDocumentId)).limit(1))[0];
      if (!guide || guide.taxpayerId !== input.taxpayerId) throw new TributarioS8Error("DAM não pertence ao contribuinte.");
      const confirmed = await tx.select({ id: taxPayments.id }).from(taxPayments).where(and(eq(taxPayments.guideId, guide.guide.id), eq(taxPayments.status, "Confirmado"))).limit(1);
      if (draw.requiresPayment && guide.guide.status !== "Paga" && !confirmed.length) throw new TributarioS8Error("O regulamento exige pagamento confirmado.");
    } else if (!(await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, input.sourceDocumentId)).limit(1))[0]) throw new TributarioS8Error("Documento de origem não encontrado.");
    const coupons = await tx.select({ id: prizeCoupons.id }).from(prizeCoupons).where(eq(prizeCoupons.drawId, draw.id));
    const couponNumber = `${draw.year}${String(draw.drawNumber).padStart(3, "0")}${String(coupons.length + 1).padStart(7, "0")}`;
    return collectionRow(await tx.insert(prizeCoupons).values({ drawId: draw.id, couponNumber, taxpayerId: input.taxpayerId, sourceDocumentType: input.sourceDocumentType, sourceDocumentId: input.sourceDocumentId, eligibilitySnapshot: json({ checkedAt: new Date(), requiresPayment: draw.requiresPayment, sourceValidated: true }) }).returning());
  });
}

async function readExecution(db: DatabaseExecutor, drawId: string): Promise<PrizeExecutionRecord | null> {
  const execution = (await db.select().from(prizeExecutions).where(and(eq(prizeExecutions.drawId, drawId), eq(prizeExecutions.executionNumber, 1))).limit(1))[0];
  if (!execution) return null;
  const winners = await db.select({ winner: prizeWinners, coupon: prizeCoupons }).from(prizeWinners).innerJoin(prizeCoupons, eq(prizeCoupons.id, prizeWinners.couponId)).where(eq(prizeWinners.executionId, execution.id));
  return { ...execution, winners: winners.map(row => ({ ...row.winner, coupon: row.coupon })) };
}

export async function executePrizeDraw(db: DatabaseConnection, actor: Actor, drawId: string) {
  return withDatabaseTransaction(db, async tx => {
    await tx.select({ id: prizeDraws.id }).from(prizeDraws).where(eq(prizeDraws.id, drawId)).for("update");
    const existing = await readExecution(tx, drawId);
    if (existing) return existing;
    const draw = (await tx.select().from(prizeDraws).where(eq(prizeDraws.id, drawId)).limit(1))[0];
    if (!draw) throw new TributarioS8Error("Sorteio não encontrado.");
    const coupons = await tx.select().from(prizeCoupons).where(and(eq(prizeCoupons.drawId, draw.id), eq(prizeCoupons.status, "ELEGIVEL")));
    const result = executeDeterministicDraw(coupons, draw.technicalSeed, draw.winnerCount);
    const execution = collectionRow(await tx.insert(prizeExecutions).values({ drawId: draw.id, executionNumber: 1, algorithm: result.algorithm, seedHash: result.seedHash, inputHash: result.inputHash, resultHash: result.resultHash, status: draw.officialActReference ? "ATO_CADASTRADO" : "DEMONSTRACAO_TECNICA", executedByUsuarioId: actor.usuarioId }).returning());
    if (result.winners.length) await tx.insert(prizeWinners).values(result.winners.map((winner, index) => ({ executionId: execution.id, couponId: winner.coupon.id, position: index + 1, resultKey: winner.resultKey })));
    await tx.update(prizeDraws).set({ status: draw.officialActReference ? "EXECUTADO_COM_ATO_CADASTRADO" : "DEMONSTRACAO_EXECUTADA", executedAt: new Date() }).where(eq(prizeDraws.id, draw.id));
    return (await readExecution(tx, drawId))!;
  });
}
