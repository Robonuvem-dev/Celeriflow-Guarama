import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { accountingTransactions } from "@/db/schema/finance-accounting";
import { reconciliationTreasuryMovements } from "@/db/schema/finance-reconciliation";
import { taxActiveDebts, taxIntegrationEvents, taxPayments } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { findTaxIntegrationEventByKey, lockTaxAccountingKey, lockTaxAccountingRow, readConfirmedTaxAssessmentPayments, readTaxAccountingTransaction, readTaxAssessment, readTaxPayment, readTaxRegistryEntry, readTaxTreasuryMovement, taxAccountingObject as taxScopeSnapshot, taxJsonString } from "@/db/repositories/tax-accounting/records";
import { getBankAccountBalance, postAccountingTransactionInTransaction, reverseRevenueInTransaction } from "@/lib/financeiro";
import type { TaxActor } from "./index";
import { TaxError } from "./assessment-engine";
import { resolveTaxAssessmentScope, taxAssessmentCompensatedValue } from "./scope";
import { assertTaxCreditScope } from "./credit-finance";
import { reclassifyRestoredTaxReceivable } from "./accrual-accounting";
import { reversePaidItbiInTransaction } from "./itbi-ownership";
import { getBankResourceSourceSpendableBalance } from "../financeiro/bank-resource-sources";
import { reverseConditionalPaymentDiscount } from "./conditional-discounts";

/** Reverses a collection and its unused excess without erasing any origin record. */
export async function reverseTaxPayment(db: DatabaseConnection, actor: TaxActor, input: {
  paymentId: string; date: Date; reason: string; idempotencyKey: string;
}) {
  if (!input.reason.trim() || !input.idempotencyKey.trim() || !Number.isFinite(input.date.getTime())) throw new TaxError("Informe data, fundamento e chave válidos para o estorno tributário.");
  return withDatabaseTransaction(db, async (tx) => {
    const key = `TAX_PAYMENT_REVERSAL:${input.idempotencyKey.trim()}`;
    await lockTaxAccountingKey(tx, key);
    const origin = await readTaxPayment(tx, input.paymentId);
    await lockTaxAccountingRow(tx, "TaxAssessment", origin.guide.assessmentId);
    await lockTaxAccountingRow(tx, "TaxGuide", origin.guideId);
    const payment = await readTaxPayment(tx, input.paymentId);
    const scope = await resolveTaxAssessmentScope(tx, actor, payment.guide.assessment.taxId, payment.guide.assessment.calculationSnapshot);
    const previous = await findTaxIntegrationEventByKey(tx, key);
    if (previous) {
      const payload = taxScopeSnapshot(previous.payload);
      if (payload.paymentId !== input.paymentId || payload.date !== input.date.toISOString() || payload.reason !== input.reason.trim()) throw new TaxError("Estorno já registrado com outros dados.");
      return previous;
    }
    if (payment.status !== "Confirmado" || !payment.revenueIntegration || !payment.bankAccountId || !payment.amountPaidDecimal) throw new TaxError("Pagamento não está confirmado ou sua origem financeira está incompleta.");
    if (input.date < payment.paymentDate) throw new TaxError("O estorno não pode anteceder o pagamento.");
    const credits = payment.idempotencyKey ? await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "TAX_CREDIT"), eq(taxRegistryEntries.source, "RETORNO_BANCARIO"), taxJsonString(taxRegistryEntries.data, "originEventKey", payment.idempotencyKey))).orderBy(asc(taxRegistryEntries.id)) : [];
    let excess = new Decimal(0);
    for (const credit of credits) {
      await lockTaxAccountingRow(tx, "TaxRegistryEntry", credit.id);
      const current = await readTaxRegistryEntry(tx, credit.id);
      const data = taxScopeSnapshot(current.data);
      await assertTaxCreditScope(tx, actor, current.data);
      const value = new Decimal(String(data.amount));
      const available = new Decimal(String(data.available));
      if (!value.isFinite() || value.lte(0) || !available.eq(value) || current.status !== "DISPONIVEL") throw new TaxError("Crédito excedente já utilizado; reverta suas compensações, transferências ou restituições antes de estornar a arrecadação.");
      if (data.originGuideId !== payment.guideId || data.bankAccountId !== payment.bankAccountId || typeof data.ingressTransactionId !== "string" || typeof data.ingressMovementId !== "string") throw new TaxError("Ingresso do excedente não está conciliado com o pagamento.");
      excess = excess.plus(value);
    }
    await lockTaxAccountingRow(tx, "BankAccount", payment.bankAccountId);
    if ((await getBankAccountBalance(tx, payment.bankAccountId, input.date)).lt(payment.amountPaidDecimal.plus(excess))) throw new TaxError("Saldo insuficiente para estornar pagamento e excedente integralmente.");
    const reversal = await reverseRevenueInTransaction(tx, actor, { revenueId: payment.revenueIntegration.revenueId, taxPaymentId: payment.id, date: input.date, justification: input.reason });
    const debtPosition = (await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, payment.guide.assessmentId), eq(taxRegistryEntries.category, "DEBT_ACCOUNTING_POSITION"), inArray(taxRegistryEntries.status, ["ATIVO", "DEVOLVIDA"]))).limit(1))[0];
    if (debtPosition) {
      const originals = await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(and(eq(accountingTransactions.sourceModule, "TRIBUTARIO"), eq(accountingTransactions.sourceType, "TAX_PAYMENT"), eq(accountingTransactions.sourceId, payment.revenueIntegration.revenueId), eq(accountingTransactions.eventType, "RECEITA_ARRECADADA"), eq(accountingTransactions.status, "POSTADO"), isNull(accountingTransactions.reversalOfId)));
      if (originals.length !== 1) throw new TaxError("Arrecadação da dívida sem partida canônica original única.");
      await reclassifyRestoredTaxReceivable(tx, actor, { assessmentId: payment.guide.assessmentId, originalTransactionId: originals[0].id, amount: payment.amountPaidDecimal, date: input.date, idempotencyKey: `${key}:DA_RESTORATION`, reason: `Recomposição do direito em dívida ativa após estorno do pagamento ${payment.id}` });
    }
    for (const credit of credits) {
      const data = taxScopeSnapshot(credit.data);
      const original = await readTaxAccountingTransaction(tx, String(data.ingressTransactionId));
      const ingress = await readTaxTreasuryMovement(tx, String(data.ingressMovementId));
      if (!ingress.resourceSourceId || (await getBankResourceSourceSpendableBalance(tx, ingress.bankAccountId, ingress.resourceSourceId, input.date)).lt(ingress.valueDecimal)) throw new TaxError("Saldo por fonte insuficiente ou não conciliado para estornar o excedente.");
      if (original.budgetUnitId !== scope.budgetUnitId || original.financialYearId !== reversal.financialYearId || ingress.bankAccountId !== payment.bankAccountId || ingress.direction !== "Entrada" || !ingress.valueDecimal.eq(String(data.amount))) throw new TaxError("Partida ou caixa do excedente divergente da origem.");
      const transaction = await postAccountingTransactionInTransaction(tx, actor, {
        financialYearId: original.financialYearId, governmentEntityId: original.governmentEntityId ?? undefined, budgetUnitId: original.budgetUnitId ?? undefined,
        date: input.date, history: `Estorno do excedente ${credit.id}: ${input.reason.trim()}`, sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT_REVERSAL", sourceId: credit.id,
        eventType: "TAX_COLLECTION_EXCESS_REVERSED", idempotencyKey: `${key}:CREDIT:${credit.id}:ACCOUNTING`, reversalOfId: original.id,
        lines: original.entries.map((entry) => { if (!entry.valueDecimal) throw new TaxError("Partida original do excedente sem Decimal conciliado."); return { originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" as const : "Débito" as const, value: entry.valueDecimal }; }),
      });
      const [movement] = await tx.insert(reconciliationTreasuryMovements).values({ date: input.date, type: "ExtraBudgetReceiptReversal", resourceSourceId: ingress.resourceSourceId, direction: "Saída", valueDecimal: ingress.valueDecimal, bankAccountId: ingress.bankAccountId, financialYearId: original.financialYearId, history: transaction.history, sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT_REVERSAL", sourceId: credit.id, eventType: "TAX_COLLECTION_EXCESS_REVERSED", idempotencyKey: `${key}:CREDIT:${credit.id}:TREASURY` }).returning();
      await tx.update(taxRegistryEntries).set({ status: "ESTORNADO", data: { ...data, available: "0.00", reversalTransactionId: transaction.id, reversalMovementId: movement.id, reversedAt: input.date.toISOString() } }).where(eq(taxRegistryEntries.id, credit.id));
    }
    await tx.update(taxPayments).set({ status: "Estornado" }).where(eq(taxPayments.id, payment.id));
    await reverseConditionalPaymentDiscount(tx, actor, { assessmentId: payment.guide.assessmentId, paymentKey: payment.idempotencyKey, date: input.date, reason: input.reason });
    await reversePaidItbiInTransaction(tx, actor, payment.id, input.date);
    const paid = await readConfirmedTaxAssessmentPayments(tx, payment.guide.assessmentId);
    const sum = (rows: typeof paid) => rows.reduce((total, row) => { if (!row.amountPaidDecimal) throw new TaxError("Pagamento histórico sem Decimal conciliado."); return total.plus(row.amountPaidDecimal); }, new Decimal(0));
    const guidePaid = sum(paid.filter((row) => row.guideId === payment.guideId));
    if (!payment.guide.totalValueDecimal) throw new TaxError("Guia sem Decimal conciliado.");
    if (payment.guide.status !== "Cancelada") await tx.update(taxGuides).set({ status: guidePaid.gte(payment.guide.totalValueDecimal) ? "Paga" : guidePaid.gt(0) ? "Parcial" : "Emitida" }).where(eq(taxGuides.id, payment.guideId));
    const assessment = await readTaxAssessment(tx, payment.guide.assessmentId);
    const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
    if (!total) throw new TaxError("Lançamento sem Decimal conciliado.");
    const extinguished = sum(paid).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
    const debt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessment.id)).limit(1))[0];
    const activeDebt = debt && !["DEVOLVIDA", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO"].includes(debt.status);
    await tx.update(taxAssessments).set({ status: extinguished.gte(total) ? "Pago" : activeDebt ? "Dívida Ativa" : extinguished.gt(0) ? "Parcial" : "Emitido" }).where(eq(taxAssessments.id, assessment.id));
    if (debt) {
      const remaining = Decimal.max(0, total.minus(extinguished));
      const paymentAudit = (await tx.select({ payload: taxAuditLogs.payload }).from(taxAuditLogs).where(and(eq(taxAuditLogs.action, "CONFIRM_PAYMENT"), eq(taxAuditLogs.entityType, "TaxPayment"), eq(taxAuditLogs.entityId, payment.id))).orderBy(asc(taxAuditLogs.createdAt)).limit(1))[0];
      const previousStatus = taxScopeSnapshot(paymentAudit?.payload).debtStatusBefore;
      const legalStatus = ["EM_PROTESTO", "AJUIZADA"].includes(String(previousStatus)) ? String(previousStatus) : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : null;
      const collecting = ["Paga", "PAGA", "Inscrita", "INSCRITA", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status);
      await tx.update(taxActiveDebts).set({ updatedValue: Number(remaining), updatedValueDecimal: remaining, ...(collecting ? { status: remaining.isZero() ? "PAGA" : legalStatus ?? (extinguished.gt(0) ? "EM_COBRANCA" : "INSCRITA") } : {}) }).where(eq(taxActiveDebts.id, debt.id));
    }
    const [event] = await tx.insert(taxIntegrationEvents).values({ integrationCode: "TAX_PAYMENT", eventType: "PAYMENT_REVERSED", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: assessment.taxpayerId, payload: { paymentId: payment.id, date: input.date.toISOString(), reason: input.reason.trim(), ...scope }, result: { revenueReversalId: reversal.id, excessReversed: excess.toFixed(2), creditIds: credits.map((credit) => credit.id) }, processedAt: new Date() }).returning();
    await tx.insert(taxAuditLogs).values({ action: "REVERSE_PAYMENT", entityType: "TaxPayment", entityId: payment.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { integrationEventId: event.id, revenueReversalId: reversal.id, reason: input.reason.trim() } });
    return event;
  }, { timeoutMs: 60000 });
}
