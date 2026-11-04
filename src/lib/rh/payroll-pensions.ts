import { Decimal } from "@/db/decimal";
import type { Decimal as DecimalJs } from "decimal.js";
import { z } from "zod";
import { HR_PAYROLL_TYPES } from "./calculation-engine";

const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
export const payrollPensionPolicySchema = z.object({
  origin: z.literal("PENSOES_FOLHA"), legalReference: z.string().min(3),
  entries: z.array(z.object({
    id: z.string().min(1).max(100), contractId: z.string().min(1), beneficiaryPersonId: z.string().min(1),
    courtReference: z.string().trim().min(5).max(1000), startsAt: z.iso.date(), endsAt: z.iso.date().nullable(),
    payrollTypes: z.array(z.enum(HR_PAYROLL_TYPES)).min(1),
    method: z.enum(["FIXO", "PERCENTUAL"]), value: money,
    basis: z.enum(["BRUTO", "APOS_PREVIDENCIA", "APOS_IRRF"]), deductFromIncomeTax: z.boolean(),
    terminationTaxAllocation: z.enum(["MENSAL", "DECIMO_TERCEIRO", "PROPORCIONAL"]).optional(),
    taxRefundTreatment: z.enum(["EXCLUIR", "INCLUIR_CONFORME_TITULO"]).optional(),
    partialPeriod: z.enum(["INTEGRAL_CONFORME_TITULO", "PROPORCIONAL_DIAS_CIVIS"]).optional(),
  }).strict()).max(1000),
}).strict().superRefine((policy, ctx) => {
  if (new Set(policy.entries.map(entry => entry.id)).size !== policy.entries.length) ctx.addIssue({ code: "custom", message: "Identificadores de pensão duplicados." });
  for (const entry of policy.entries) {
    if ((entry.endsAt && entry.endsAt < entry.startsAt) || (entry.method === "PERCENTUAL" && new Decimal(entry.value).gt(100)) || (entry.deductFromIncomeTax && entry.basis === "APOS_IRRF")) ctx.addIssue({ code: "custom", message: "Pensão com vigência/percentual inválido ou dedução fiscal circular." });
  }
});

export function calculatePayrollPensions(raw: unknown, input: { contractId: string; payrollType: string; start: Date; end: Date; gross: DecimalJs.Value; socialContribution: DecimalJs.Value; incomeTax: DecimalJs.Value; phase: "ANTES_IRRF" | "APOS_IRRF" }) {
  const policy = payrollPensionPolicySchema.parse(raw);
  const D = (value: DecimalJs.Value) => new Decimal(value);
  const gross = D(input.gross), social = D(input.socialContribution), tax = D(input.incomeTax);
  if ([gross, social, tax].some(value => !value.isFinite()) || gross.lt(0)) throw new Error("Base de pensão inválida.");
  return policy.entries.filter(entry => entry.contractId === input.contractId && entry.payrollTypes.includes(input.payrollType as typeof HR_PAYROLL_TYPES[number]) && entry.startsAt <= input.end.toISOString().slice(0, 10) && (!entry.endsAt || entry.endsAt >= input.start.toISOString().slice(0, 10)) && (entry.basis === "APOS_IRRF" ? input.phase === "APOS_IRRF" : input.phase === "ANTES_IRRF")).sort((a, b) => a.id.localeCompare(b.id)).map(entry => {
    const from = input.start.toISOString().slice(0, 10), until = input.end.toISOString().slice(0, 10);
    const partial = entry.startsAt > from || Boolean(entry.endsAt && entry.endsAt < until);
    if (partial && !entry.partialPeriod) throw new Error("Pensão iniciada/encerrada intramês exige decisão explícita de proporcionalidade conforme o título judicial.");
    const activeFrom = entry.startsAt > from ? entry.startsAt : from, activeUntil = entry.endsAt && entry.endsAt < until ? entry.endsAt : until;
    const days = (new Date(`${activeUntil}T00:00:00Z`).getTime() - new Date(`${activeFrom}T00:00:00Z`).getTime()) / 86400000 + 1;
    const periodDays = (new Date(`${until}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000 + 1;
    const factor = entry.partialPeriod === "PROPORCIONAL_DIAS_CIVIS" ? new Decimal(days).div(periodDays) : new Decimal(1);
    const includesRefunds = entry.taxRefundTreatment === "INCLUIR_CONFORME_TITULO";
    const contributionForBasis = includesRefunds ? social : Decimal.max(0, social), incomeTaxForBasis = includesRefunds ? tax : Decimal.max(0, tax);
    const base = Decimal.max(0, entry.basis === "BRUTO" ? gross : entry.basis === "APOS_PREVIDENCIA" ? gross.sub(contributionForBasis) : gross.sub(contributionForBasis).sub(incomeTaxForBasis));
    const amount = (entry.method === "FIXO" ? D(entry.value) : base.mul(entry.value).div(100)).mul(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { ...entry, base: base.toFixed(2), amount: amount.toFixed(2), legalReference: policy.legalReference, periodMemory: { from: activeFrom, until: activeUntil, days, periodDays, factor: factor.toString(), treatment: entry.partialPeriod ?? "INTEGRAL_PERIODO_COMPLETO" }, compensationMemory: { treatment: entry.taxRefundTreatment ?? "EXCLUIR", contributionForBasis: contributionForBasis.toFixed(2), incomeTaxForBasis: incomeTaxForBasis.toFixed(2), socialRefund: Decimal.max(0, social.neg()).toFixed(2), incomeTaxRefund: Decimal.max(0, tax.neg()).toFixed(2) } };
  });
}

export type PayrollPensionMemory = ReturnType<typeof calculatePayrollPensions>;
