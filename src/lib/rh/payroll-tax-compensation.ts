import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { allocatePayrollAmount, HR_PAYROLL_TYPES } from "./calculation-engine";

export const payrollTaxCompensationPolicySchema = z.object({ origin: z.literal("COMPENSACAO_TRIBUTARIA_FOLHA"), payrollTypes: z.array(z.enum(HR_PAYROLL_TYPES)).min(1), taxes: z.array(z.enum(["IRRF", "PREVIDENCIA_PESSOAL", "PREVIDENCIA_PATRONAL"])).min(1), from: z.iso.date(), until: z.iso.date(), legalReference: z.string().trim().min(10).max(4000) }).strict().refine(value => value.from <= value.until, "Vigência da compensação invertida.");

/** A negative tax reverses its original withholding; it does not create taxable earnings. */
export function allocateTaxDifference(input: { amount: Decimal; bases: Decimal[]; previousBases: Decimal[]; tax: "IRRF" | "PREVIDENCIA_PESSOAL" | "PREVIDENCIA_PATRONAL"; payrollType: string; reference: string; priorTax: Decimal; policy: unknown }) {
  if (!input.amount.isNegative()) return allocatePayrollAmount(input.amount, input.bases);
  const policy = payrollTaxCompensationPolicySchema.parse(input.policy);
  if (!policy.payrollTypes.some(type => type === input.payrollType) || !policy.taxes.includes(input.tax) || input.reference < policy.from || input.reference > policy.until) throw new Error("A compensação tributária não está autorizada para o tributo, modalidade e referência.");
  if (!input.priorTax.isPositive() || input.amount.abs().gt(input.priorTax)) throw new Error("A compensação não pode superar o tributo anteriormente apurado na origem vinculada.");
  const weights = input.bases.some(base => base.gt(0)) ? input.bases : input.previousBases;
  return allocatePayrollAmount(input.amount.abs(), weights).map(share => share.neg());
}
