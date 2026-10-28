import { and, count, eq, inArray, isNull, ne, notExists, notInArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { taxActiveDebts, taxDebtInstallments } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { readConfirmedTaxAssessmentPayments, readTaxAccountingTransaction, readTaxAssessment, readTaxGuide, taxAccountingObject as taxScopeSnapshot, taxJsonString } from "@/db/repositories/tax-accounting/records";
import type { TaxActor } from "./index";
import { fiscalPaymentOptionSchema, type FiscalPaymentOption } from "./fiscal-payment-option-schema";
import { taxAssessmentCompensatedValue, resolveTaxAssessmentScope, resolveTaxFinancialYear } from "./scope";
import { postTaxAssessmentAdjustment, reclassifyRestoredTaxReceivable } from "./accrual-accounting";
import { postAccountingTransactionInTransaction } from "@/lib/financeiro";

/** Only recorded origins are used; unknown legacy origins cannot establish debt clearance. */
export async function assertPaymentOptionDebtEligibility(tx: DatabaseTransaction, input: { taxpayerId: string; assessmentId: string; year: number; governmentEntityId: string; option: FiscalPaymentOption }) {
  const { option } = input;
  if (option.debtCheck === "NONE") return;
  const taxFilter = option.debtTaxIds.length ? inArray(taxAssessments.taxId, option.debtTaxIds) : undefined;
  if (["CURRENT", "ALL"].includes(option.debtCheck)) {
    const assessments = await tx.select().from(taxAssessments).where(and(eq(taxAssessments.taxpayerId, input.taxpayerId), ne(taxAssessments.id, input.assessmentId), eq(taxAssessments.year, input.year), notInArray(taxAssessments.status, ["Cancelado", "Extinto", "Dívida Ativa"]), taxFilter));
    for (const row of assessments) {
      const scope = taxScopeSnapshot(row.calculationSnapshot);
      if (typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") throw new Error("Débito do exercício sem origem conciliada impede conceder o desconto.");
      if (scope.governmentEntityId !== input.governmentEntityId) continue;
      if (!(await tx.select().from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, scope.governmentEntityId), eq(planningEntityUnits.budgetUnitId, scope.budgetUnitId))).limit(1))[0]) throw new Error("Origem do débito do exercício não conciliada.");
      const payments = await readConfirmedTaxAssessmentPayments(tx, row.id);
      if (!row.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal)) throw new Error("Débito do exercício sem valores Decimal conciliados.");
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), await taxAssessmentCompensatedValue(tx, row.id));
      if (row.finalValueDecimal.gt(paid)) throw new Error("Contribuinte possui débito do exercício impeditivo para esta opção de desconto.");
    }
  }
  if (["ACTIVE", "INSTALLMENT", "ALL"].includes(option.debtCheck)) {
    const unlinked = await tx.select({ calculationSnapshot: taxAssessments.calculationSnapshot }).from(taxAssessments).where(and(eq(taxAssessments.taxpayerId, input.taxpayerId), eq(taxAssessments.status, "Dívida Ativa"), notExists(tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, taxAssessments.id))), taxFilter));
    for (const row of unlinked) {
      const origin = taxScopeSnapshot(row.calculationSnapshot);
      if (typeof origin.governmentEntityId !== "string" || origin.governmentEntityId === input.governmentEntityId) throw new Error("Lançamento em dívida ativa sem inscrição conciliada impede conceder o desconto.");
    }
    const closedDebts = ["Paga", "PAGA", "Cancelada", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"];
    const closedInstallments = ["Pago", "PAGO", "Cancelado", "CANCELADO", "Rescindido", "RESCINDIDO"];
    const debts = await tx.select({ debt: taxActiveDebts, assessment: taxAssessments }).from(taxActiveDebts).leftJoin(taxAssessments, eq(taxAssessments.id, taxActiveDebts.assessmentId)).where(and(eq(taxActiveDebts.taxpayerId, input.taxpayerId), notInArray(taxActiveDebts.status, closedDebts)));
    for (const { debt, assessment } of debts) {
      const origin = taxScopeSnapshot(assessment?.calculationSnapshot);
      const entityId = debt.governmentEntityId ?? origin.governmentEntityId;
      const unitId = debt.budgetUnitId ?? origin.budgetUnitId;
      if (typeof entityId !== "string" || typeof unitId !== "string") throw new Error("Dívida ativa sem origem conciliada impede conceder o desconto.");
      if (entityId !== input.governmentEntityId) continue;
      if ((origin.governmentEntityId && origin.governmentEntityId !== entityId) || (origin.budgetUnitId && origin.budgetUnitId !== unitId) || !(await tx.select().from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, entityId), eq(planningEntityUnits.budgetUnitId, unitId))).limit(1))[0]) throw new Error("Origem da dívida ativa divergente.");
      if (option.debtTaxIds.length) {
        if (!assessment) throw new Error("Dívida ativa sem tributo de origem conciliado para o filtro de desconto.");
        if (!option.debtTaxIds.includes(assessment.taxId)) continue;
      }
      const installments = await tx.select({ status: taxDebtInstallments.status }).from(taxDebtInstallments).where(eq(taxDebtInstallments.activeDebtId, debt.id));
      if (option.debtCheck !== "INSTALLMENT" || installments.some(row => !closedInstallments.includes(row.status))) throw new Error("Contribuinte possui dívida ativa ou parcelamento impeditivo para esta opção de desconto.");
    }
    if (["INSTALLMENT", "ALL"].includes(option.debtCheck) && (await tx.select({ id: taxDebtInstallments.id }).from(taxDebtInstallments).where(and(eq(taxDebtInstallments.taxpayerId, input.taxpayerId), isNull(taxDebtInstallments.activeDebtId), notInArray(taxDebtInstallments.status, closedInstallments))).limit(1))[0]) throw new Error("Parcelamento sem origem conciliada impede conceder o desconto.");
    if (["INSTALLMENT", "ALL"].includes(option.debtCheck)) {
      const inconsistent = await tx.select({ debt: taxActiveDebts, assessment: taxAssessments }).from(taxDebtInstallments).innerJoin(taxActiveDebts, eq(taxActiveDebts.id, taxDebtInstallments.activeDebtId)).leftJoin(taxAssessments, eq(taxAssessments.id, taxActiveDebts.assessmentId)).where(and(eq(taxDebtInstallments.taxpayerId, input.taxpayerId), notInArray(taxDebtInstallments.status, closedInstallments), inArray(taxActiveDebts.status, closedDebts)));
      for (const { debt, assessment } of inconsistent) {
        const origin = taxScopeSnapshot(assessment?.calculationSnapshot);
        const entityId = debt.governmentEntityId ?? origin.governmentEntityId;
        if (typeof entityId !== "string") throw new Error("Parcelamento com origem não conciliada impede conceder o desconto.");
        if (entityId !== input.governmentEntityId) continue;
        if (option.debtTaxIds.length && assessment && !option.debtTaxIds.includes(assessment.taxId)) continue;
        throw new Error("Há parcelamento vigente vinculado a dívida baixada. Concilie o parcelamento antes de conceder o desconto.");
      }
    }
  }
}

/** Called while the assessment and guide are locked. Cash remains the actual payment. */
export async function applyConditionalGuideDiscount(tx: DatabaseTransaction, actor: TaxActor, input: { guideId: string; amountPaid: Decimal; paymentDate: Date; paymentKey: string }) {
  const guide = await readTaxGuide(tx, input.guideId);
  const data = taxScopeSnapshot(guide.calculationSnapshot);
  if (!data.conditionalPaymentOption) return;
  const option = fiscalPaymentOptionSchema.parse(data.conditionalPaymentOption);
  const assessment = guide.assessment;
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  if (!scope.governmentEntityId || !scope.budgetUnitId) throw new Error("Desconto exige origem municipal conciliada.");
  if (["Cancelado", "Extinto", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new Error("Crédito indisponível para concessão do desconto condicionado.");
  if (input.paymentDate > new Date(`${option.dueDate}T23:59:59.999Z`)) throw new Error("Prazo da opção de pagamento vencido. Emita guia atualizada sem este desconto.");
  if (!guide.totalValueDecimal?.eq(input.amountPaid)) throw new Error("A opção de cota única exige pagamento integral do valor líquido da guia.");
  if ((await readConfirmedTaxAssessmentPayments(tx, assessment.id)).length || (await taxAssessmentCompensatedValue(tx, assessment.id)).gt(0)) throw new Error("O desconto de cota única exige crédito sem recebimentos ou compensações anteriores.");
  if ((await tx.select({ total: count() }).from(taxGuides).where(and(eq(taxGuides.assessmentId, assessment.id), ne(taxGuides.id, guide.id), ne(taxGuides.status, "Cancelada"))))[0].total) throw new Error("Cancele as demais guias deste lançamento antes de confirmar a opção de cota única.");
  const gross = new Decimal(String(data.grossAmount));
  const discount = gross.mul(option.discountPercent).div(100).toDecimalPlaces(2);
  if (!gross.isFinite() || gross.lte(0) || !assessment.finalValueDecimal?.eq(gross) || !gross.minus(discount).eq(input.amountPaid)) throw new Error("Crédito diverge da memória congelada da opção de pagamento.");
  await assertPaymentOptionDebtEligibility(tx, { taxpayerId: assessment.taxpayerId, assessmentId: assessment.id, year: assessment.year, governmentEntityId: scope.governmentEntityId, option });
  if (discount.isZero()) return;
  const accounting = await postTaxAssessmentAdjustment(tx, actor, { assessmentId: assessment.id, date: input.paymentDate, delta: discount.negated(), kind: "BENEFIT", idempotencyKey: `CONDITIONAL_DISCOUNT:${input.paymentKey}`, reason: `${option.name}: ${option.legalBasis}` });
  await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CONDITIONAL_DISCOUNT", title: option.name, actorUsuarioId: actor.usuarioId, data: { ...scope, option, guideId: guide.id, paymentKey: input.paymentKey, grossAmount: gross.toFixed(2), discountAmount: discount.toFixed(2), netAmount: input.amountPaid.toFixed(2), accountingTransactionId: accounting?.id ?? null, paymentDate: input.paymentDate.toISOString() } });
  await tx.update(taxAssessments).set({ finalValueDecimal: input.amountPaid, discountValueDecimal: (assessment.discountValueDecimal ?? new Decimal(0)).plus(discount), calculationSnapshot: { ...taxScopeSnapshot(assessment.calculationSnapshot), currentValue: input.amountPaid.toFixed(2), conditionalDiscountPaymentKey: input.paymentKey } }).where(eq(taxAssessments.id, assessment.id));
  await tx.insert(taxAuditLogs).values({ action: "APPLY_CONDITIONAL_DISCOUNT", entityType: "TaxAssessment", entityId: assessment.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, guideId: guide.id, paymentKey: input.paymentKey, discountAmount: discount.toFixed(2), option } });
}

/** Additive reversal restores the original right and deduction; it never creates cash. */
export async function reverseConditionalPaymentDiscount(tx: DatabaseTransaction, actor: TaxActor, input: { assessmentId: string; paymentKey: string | null; date: Date; reason: string }) {
  if (!input.paymentKey) return;
  const entry = (await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, input.assessmentId), eq(taxRegistryEntries.category, "CONDITIONAL_DISCOUNT"), taxJsonString(taxRegistryEntries.data, "paymentKey", input.paymentKey))).limit(1))[0];
  if (!entry) return;
  if ((await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, input.assessmentId), eq(taxRegistryEntries.category, "CONDITIONAL_DISCOUNT_REVERSAL"), taxJsonString(taxRegistryEntries.data, "issuanceId", entry.id))).limit(1))[0]) return;
  const data = taxScopeSnapshot(entry.data);
  const assessment = await readTaxAssessment(tx, input.assessmentId);
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  const discount = new Decimal(String(data.discountAmount));
  if (!discount.isFinite() || discount.lte(0) || !assessment.finalValueDecimal || !assessment.discountValueDecimal || assessment.discountValueDecimal.lt(discount)) throw new Error("Desconto sem posição conciliada para estorno.");
  let accountingTransactionId: string | null = null;
  if (typeof data.accountingTransactionId === "string") {
    const original = await readTaxAccountingTransaction(tx, data.accountingTransactionId);
    if (original.reversedBy || original.status !== "POSTADO" || original.sourceId !== assessment.id || original.budgetUnitId !== scope.budgetUnitId || original.governmentEntityId !== scope.governmentEntityId || input.date < original.date || original.entries.length !== 2 || original.entries.some(row => !row.valueDecimal?.eq(discount))) throw new Error("Partida do desconto não está conciliada para estorno.");
    const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), scope);
    const reversed = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: original.governmentEntityId ?? undefined, budgetUnitId: original.budgetUnitId ?? undefined, date: input.date, history: input.reason, sourceModule: "TRIBUTACAO", sourceType: "CONDITIONAL_DISCOUNT_REVERSAL", sourceId: entry.id, eventType: "CONDITIONAL_DISCOUNT_REVERSED", idempotencyKey: `CONDITIONAL_DISCOUNT_REVERSAL:${entry.id}`, reversalOfId: original.id, lines: original.entries.map(row => ({ originalEntryId: row.id, accountId: row.accountId, type: row.type === "Débito" ? "Crédito" as const : "Débito" as const, value: row.valueDecimal! })) });
    accountingTransactionId = reversed.id;
    await reclassifyRestoredTaxReceivable(tx, actor, { assessmentId: assessment.id, originalTransactionId: original.id, amount: discount, date: input.date, idempotencyKey: `CONDITIONAL_DISCOUNT_REVERSAL:${entry.id}:RECLASSIFY`, reason: input.reason });
  }
  const restored = assessment.finalValueDecimal.plus(discount);
  await tx.update(taxAssessments).set({ finalValueDecimal: restored, discountValueDecimal: assessment.discountValueDecimal.minus(discount), calculationSnapshot: { ...taxScopeSnapshot(assessment.calculationSnapshot), currentValue: restored.toFixed(2), conditionalDiscountPaymentKey: null } }).where(eq(taxAssessments.id, assessment.id));
  await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CONDITIONAL_DISCOUNT_REVERSAL", title: "Recomposição de desconto após estorno", actorUsuarioId: actor.usuarioId, data: { ...scope, issuanceId: entry.id, paymentKey: input.paymentKey, discountAmount: discount.toFixed(2), accountingTransactionId, date: input.date.toISOString(), reason: input.reason } });
}
