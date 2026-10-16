import { Prisma } from "@prisma/client";
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
  }).strict()).max(1000),
}).strict().superRefine((policy, ctx) => {
  if (new Set(policy.entries.map(entry => entry.id)).size !== policy.entries.length) ctx.addIssue({ code: "custom", message: "Identificadores de pensão duplicados." });
  for (const entry of policy.entries) {
    if ((entry.endsAt && entry.endsAt < entry.startsAt) || (entry.method === "PERCENTUAL" && new Prisma.Decimal(entry.value).gt(100)) || (entry.deductFromIncomeTax && entry.basis === "APOS_IRRF")) ctx.addIssue({ code: "custom", message: "Pensão com vigência/percentual inválido ou dedução fiscal circular." });
  }
});

export function calculatePayrollPensions(raw: unknown, input: { contractId: string; payrollType: string; start: Date; end: Date; gross: Prisma.Decimal.Value; socialContribution: Prisma.Decimal.Value; incomeTax: Prisma.Decimal.Value; phase: "ANTES_IRRF" | "APOS_IRRF" }) {
  const policy = payrollPensionPolicySchema.parse(raw);
  const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
  const gross = D(input.gross), social = D(input.socialContribution), tax = D(input.incomeTax);
  if ([gross, social, tax].some(value => !value.isFinite() || value.lt(0))) throw new Error("Base de pensão inválida.");
  return policy.entries.filter(entry => entry.contractId === input.contractId && entry.payrollTypes.includes(input.payrollType as typeof HR_PAYROLL_TYPES[number]) && entry.startsAt <= input.end.toISOString().slice(0, 10) && (!entry.endsAt || entry.endsAt >= input.start.toISOString().slice(0, 10)) && (entry.basis === "APOS_IRRF" ? input.phase === "APOS_IRRF" : input.phase === "ANTES_IRRF")).sort((a, b) => a.id.localeCompare(b.id)).map(entry => {
    if (entry.startsAt > input.start.toISOString().slice(0, 10) || (entry.endsAt && entry.endsAt < input.end.toISOString().slice(0, 10))) throw new Error("Pensão iniciada/encerrada intramês exige decisão explícita de proporcionalidade; ajuste a vigência do modelo.");
    const base = Prisma.Decimal.max(0, entry.basis === "BRUTO" ? gross : entry.basis === "APOS_PREVIDENCIA" ? gross.sub(social) : gross.sub(social).sub(tax));
    const amount = (entry.method === "FIXO" ? D(entry.value) : base.mul(entry.value).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { ...entry, base: base.toFixed(2), amount: amount.toFixed(2), legalReference: policy.legalReference };
  });
}

export type PayrollPensionMemory = ReturnType<typeof calculatePayrollPensions>;
