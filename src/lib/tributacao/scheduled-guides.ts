import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { annualJson, insertAnnualAudit, insertAnnualRegistry, lockAnnualRow } from "@/db/repositories/tax-annual/records";
import { countScheduledActiveGuides, countScheduledPayments, insertScheduledGuide, markScheduledAssessmentIssued, nextScheduledGuideNumber, readScheduledAssessment } from "@/db/repositories/tax-annual/guides";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { fiscalPaymentOptionsSchema } from "./fiscal-payment-option-schema";
import { assertPaymentOptionDebtEligibility } from "./conditional-discounts";

export async function issueScheduledAssessmentGuides(connection: DatabaseConnection, actor: TaxActor, raw: { assessmentId: string; expectedUpdatedAt: string; mode: "SINGLE" | "INSTALLMENT"; singleDueDate: string | null; reason: string; paymentOptionCode?: string }) {
  const input = z.object({ assessmentId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), mode: z.enum(["SINGLE", "INSTALLMENT"]), singleDueDate: z.iso.date().nullable(), reason: z.string().trim().min(1).max(4000), paymentOptionCode: z.string().trim().min(1).max(60).optional() }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockAnnualRow(tx, "TaxAssessment", input.assessmentId, "UPDATE");
    const assessment = await readScheduledAssessment(tx, input.assessmentId);
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (assessment.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Lançamento alterado. Recarregue antes de emitir.");
    if (["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new Error("Crédito indisponível para emissão anual.");
    if (!assessment.finalValueDecimal || assessment.finalValueDecimal.lte(0)) throw new Error("Crédito sem valor Decimal conciliado.");
    if (await countScheduledActiveGuides(tx, assessment.id)) throw new Error("O lançamento possui guias vigentes. Consulte ou cancele as emissões anteriores.");
    if (await countScheduledPayments(tx, assessment.id) || (await taxAssessmentCompensatedValue(tx, assessment.id)).gt(0)) throw new Error("Lançamento com recebimento ou compensação exige calendário do saldo remanescente.");
    const data = taxScopeSnapshot(assessment.calculationSnapshot);
    const options = fiscalPaymentOptionsSchema.parse(data.paymentOptions ?? []);
    const option = input.paymentOptionCode ? options.find(row => row.code === input.paymentOptionCode) : undefined;
    if (input.paymentOptionCode && (!option || input.mode !== "SINGLE")) throw new Error("Selecione uma opção de cota única congelada no lançamento.");
    if (option) {
      if (!scope.governmentEntityId || !scope.budgetUnitId) throw new Error("Opção de pagamento exige origem municipal conciliada.");
      if (new Date(`${option.dueDate}T23:59:59.999Z`) < new Date()) throw new Error("Opção de pagamento vencida.");
      if (!option.dueDate.startsWith(`${assessment.year}-`)) throw new Error("Opção de pagamento pertence a outro exercício.");
      if (input.singleDueDate && input.singleDueDate !== option.dueDate) throw new Error("Vencimento deve corresponder à opção configurada.");
      await assertPaymentOptionDebtEligibility(tx, { taxpayerId: assessment.taxpayerId, assessmentId: assessment.id, year: assessment.year, governmentEntityId: scope.governmentEntityId, option });
    }
    const discount = option ? assessment.finalValueDecimal.mul(option.discountPercent).div(100).toDecimalPlaces(2) : new Decimal(0);
    const guideTotal = assessment.finalValueDecimal.minus(discount);
    const frozen = Array.isArray(data.schedule) ? data.schedule.map(row => taxScopeSnapshot(row)) : [];
    const schedule = input.mode === "SINGLE" ? [{ number: 1, amount: guideTotal.toFixed(2), dueDate: option?.dueDate ?? input.singleDueDate }] : frozen.map(row => ({ number: Number(row.number), amount: String(row.amount), dueDate: typeof row.dueDate === "string" ? row.dueDate : null }));
    if (!schedule.length || schedule.length > 120 || schedule.some((row, index) => row.number !== index + 1 || !row.dueDate || !z.iso.date().safeParse(row.dueDate).success)) throw new Error("Publique e lance uma regra com calendário anual completo ou informe o vencimento da cota única.");
    const values = schedule.map(row => new Decimal(row.amount));
    if (values.some(value => !value.isFinite() || value.lte(0)) || !values.reduce((sum, value) => sum.plus(value), new Decimal(0)).eq(guideTotal)) throw new Error("Calendário não corresponde ao valor líquido vigente. Reavalie a regra do lançamento.");
    const ids = [];
    for (const [index, item] of schedule.entries()) {
      const guideNumber = await nextScheduledGuideNumber(tx, assessment.year);
      const id = await insertScheduledGuide(tx, { assessmentId: assessment.id, guideNumber, value: values[index], dueDate: new Date(`${item.dueDate}T23:59:59.999Z`), snapshot: annualJson({ ...scope, assessmentId: assessment.id, paymentMode: input.mode, installmentNumber: item.number, installmentsCount: schedule.length, amount: values[index].toFixed(2), parameterId: data.parameterId ?? null, reason: input.reason, effect: "EMISSAO_SEM_BAIXA", ...(option ? { conditionalPaymentOption: option, grossAmount: assessment.finalValueDecimal.toFixed(2), conditionalDiscountAmount: discount.toFixed(2), discountEffect: "CONCEDIDO_APENAS_NO_PAGAMENTO_INTEGRAL_NO_PRAZO" } : {}) }) }); ids.push(id);
    }
    await markScheduledAssessmentIssued(tx, assessment.id);
    await insertAnnualRegistry(tx, { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "ANNUAL_GUIDE_SCHEDULE", title: input.mode === "SINGLE" ? "Cota única" : "Calendário de parcelas", actorUsuarioId: actor.usuarioId, data: annualJson({ ...scope, paymentMode: input.mode, guideIds: ids, schedule, amount: assessment.finalValueDecimal.toFixed(2), conditionalDiscount: discount.toFixed(2), paymentOption: option ?? null, reason: input.reason }) });
    await insertAnnualAudit(tx, actor, { action: "ISSUE_SCHEDULED_TAX_GUIDES", entityType: "TaxAssessment", entityId: assessment.id, payload: annualJson({ ...scope, paymentMode: input.mode, guideIds: ids, reason: input.reason }) }); return { guideIds: ids };
  }, { isolationLevel: "serializable", timeoutMs: 60000 });
}
