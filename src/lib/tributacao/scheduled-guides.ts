import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { fiscalPaymentOptionsSchema } from "./fiscal-payment-option-schema";
import { assertPaymentOptionDebtEligibility } from "./conditional-discounts";

export async function issueScheduledAssessmentGuides(db: PrismaClient, actor: TaxActor, raw: { assessmentId: string; expectedUpdatedAt: string; mode: "SINGLE" | "INSTALLMENT"; singleDueDate: string | null; reason: string; paymentOptionCode?: string }) {
  const input = z.object({ assessmentId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), mode: z.enum(["SINGLE", "INSTALLMENT"]), singleDueDate: z.iso.date().nullable(), reason: z.string().trim().min(1).max(4000), paymentOptionCode: z.string().trim().min(1).max(60).optional() }).parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${input.assessmentId} FOR UPDATE`;
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: input.assessmentId } });
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (assessment.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Lançamento alterado. Recarregue antes de emitir.");
    if (["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new Error("Crédito indisponível para emissão anual.");
    if (!assessment.finalValueDecimal || assessment.finalValueDecimal.lte(0)) throw new Error("Crédito sem valor Decimal conciliado.");
    if (await tx.taxGuide.count({ where: { assessmentId: assessment.id, status: { not: "Cancelada" } } })) throw new Error("O lançamento possui guias vigentes. Consulte ou cancele as emissões anteriores.");
    if (await tx.taxPayment.count({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" } }) || (await taxAssessmentCompensatedValue(tx, assessment.id)).gt(0)) throw new Error("Lançamento com recebimento ou compensação exige calendário do saldo remanescente.");
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
    const discount = option ? assessment.finalValueDecimal.mul(option.discountPercent).div(100).toDecimalPlaces(2) : new Prisma.Decimal(0);
    const guideTotal = assessment.finalValueDecimal.minus(discount);
    const frozen = Array.isArray(data.schedule) ? data.schedule.map(row => taxScopeSnapshot(row)) : [];
    const schedule = input.mode === "SINGLE" ? [{ number: 1, amount: guideTotal.toFixed(2), dueDate: option?.dueDate ?? input.singleDueDate }] : frozen.map(row => ({ number: Number(row.number), amount: String(row.amount), dueDate: typeof row.dueDate === "string" ? row.dueDate : null }));
    if (!schedule.length || schedule.length > 120 || schedule.some((row, index) => row.number !== index + 1 || !row.dueDate || !z.iso.date().safeParse(row.dueDate).success)) throw new Error("Publique e lance uma regra com calendário anual completo ou informe o vencimento da cota única.");
    const values = schedule.map(row => new Prisma.Decimal(row.amount));
    if (values.some(value => !value.isFinite() || value.lte(0)) || !values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).eq(guideTotal)) throw new Error("Calendário não corresponde ao valor líquido vigente. Reavalie a regra do lançamento.");
    const ids = [];
    for (const [index, item] of schedule.entries()) {
      const sequence = await tx.taxDocumentSequence.upsert({ where: { year_documentType: { year: assessment.year, documentType: "GUIDE" } }, create: { year: assessment.year, documentType: "GUIDE", currentValue: 1 }, update: { currentValue: { increment: 1 } } });
      const guide = await tx.taxGuide.create({ data: { assessmentId: assessment.id, guideNumber: `DAM-${assessment.year}-${String(sequence.currentValue).padStart(7, "0")}`, totalValue: Number(values[index]), totalValueDecimal: values[index], dueDate: new Date(`${item.dueDate}T23:59:59.999Z`), status: "Emitida", calculationSnapshot: { ...scope, assessmentId: assessment.id, paymentMode: input.mode, installmentNumber: item.number, installmentsCount: schedule.length, amount: values[index].toFixed(2), parameterId: data.parameterId ?? null, reason: input.reason, effect: "EMISSAO_SEM_BAIXA", ...(option ? { conditionalPaymentOption: option, grossAmount: assessment.finalValueDecimal.toFixed(2), conditionalDiscountAmount: discount.toFixed(2), discountEffect: "CONCEDIDO_APENAS_NO_PAGAMENTO_INTEGRAL_NO_PRAZO" } : {}) } } }); ids.push(guide.id);
    }
    await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Emitido" } });
    await tx.taxRegistryEntry.create({ data: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "ANNUAL_GUIDE_SCHEDULE", title: input.mode === "SINGLE" ? "Cota única" : "Calendário de parcelas", actorUsuarioId: actor.usuarioId, data: { ...scope, paymentMode: input.mode, guideIds: ids, schedule, amount: assessment.finalValueDecimal.toFixed(2), conditionalDiscount: discount.toFixed(2), paymentOption: option ?? null, reason: input.reason } } });
    await tx.taxAuditLog.create({ data: { action: "ISSUE_SCHEDULED_TAX_GUIDES", entityType: "TaxAssessment", entityId: assessment.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, paymentMode: input.mode, guideIds: ids, reason: input.reason } } }); return { guideIds: ids };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
