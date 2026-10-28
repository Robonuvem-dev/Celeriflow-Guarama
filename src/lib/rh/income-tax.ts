import { Decimal } from "@/db/decimal";
import type { Decimal as DecimalJs } from "decimal.js";
import { z } from "zod";
import { calculateContribution, type PayrollBand } from "./calculation-engine";

const amount = z.string().regex(/^\d+(?:\.\d{1,6})?$/);
export const incomeTaxReductionSchema = z.object({
  origin: z.literal("IRRF_REDUCAO_MENSAL"), effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date().nullable(),
  exemptIncomeLimit: amount, reductionIncomeLimit: amount, maximumReduction: amount,
  linearConstant: amount, linearFactor: amount, legalReference: z.string().min(3),
}).strict().refine(policy => new Decimal(policy.reductionIncomeLimit).gt(policy.exemptIncomeLimit) && (!policy.effectiveUntil || policy.effectiveUntil >= policy.effectiveFrom), "Limites/vigência da redução inválidos.");

export const incomeTaxBandSchema = z.object({ lowerLimit: amount, upperLimit: amount.nullable(), employeeRate: amount, amountToDeduct: amount.optional() }).strict();
export type IncomeTaxBand = PayrollBand & { amountToDeduct?: string };
const D = (value: DecimalJs.Value) => new Decimal(value);
const round = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Reduction uses taxable INCOME before deductions, once per person. RRA uses
 * its own month multiplier and deliberately does not apply the monthly reduction. */
export function calculateIncomeTax(input: {
  income: DecimalJs.Value; legalDeductions: DecimalJs.Value; simplifiedDeduction: DecimalJs.Value;
  bands: IncomeTaxBand[]; referenceDate: string; reductionPolicy?: unknown; rraMonths?: number;
}) {
  const income = D(input.income), legal = D(input.legalDeductions), simplified = D(input.simplifiedDeduction);
  if ([income, legal, simplified].some(value => !value.isFinite() || value.lt(0))) throw new Error("Renda/deduções de IRRF inválidas.");
  const months = input.rraMonths ?? 1;
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new Error("Quantidade de meses RRA inválida.");
  const deduction = Decimal.max(legal, simplified);
  const base = round(Decimal.max(0, income.sub(deduction)));
  const perMonth = base.div(months);
  // Also validate continuity/rates for the direct rate-minus-deduction table.
  const progressive = calculateContribution(perMonth, input.bands, "PROGRESSIVA", null);
  const hasDeductions = input.bands.some(band => band.amountToDeduct !== undefined);
  if (hasDeductions && input.bands.some(band => band.amountToDeduct === undefined)) throw new Error("Informe a parcela a deduzir em todas as faixas IRRF.");
  const band = [...input.bands].sort((a, b) => D(a.lowerLimit).cmp(b.lowerLimit)).find(band => perMonth.gte(band.lowerLimit) && (band.upperLimit === null || perMonth.lte(band.upperLimit)));
  if (!band) throw new Error("Faixa IRRF não encontrada.");
  const preliminary = hasDeductions ? round(Decimal.max(0, perMonth.mul(band.employeeRate).div(100).sub(band.amountToDeduct!)).mul(months)) : round(progressive.mul(months));
  let reduction = D(0);
  const policy = input.reductionPolicy === undefined ? null : incomeTaxReductionSchema.parse(input.reductionPolicy);
  if (policy && input.rraMonths === undefined && input.referenceDate >= policy.effectiveFrom && (!policy.effectiveUntil || input.referenceDate <= policy.effectiveUntil)) {
    if (income.lte(policy.exemptIncomeLimit)) reduction = Decimal.min(preliminary, D(policy.maximumReduction));
    else if (income.lte(policy.reductionIncomeLimit)) reduction = Decimal.min(preliminary, round(Decimal.max(0, D(policy.linearConstant).sub(D(policy.linearFactor).mul(income)))));
  }
  return { income: income.toFixed(2), legalDeductions: legal.toFixed(2), simplifiedDeduction: simplified.toFixed(2), deduction: deduction.toFixed(2), deductionMethod: legal.gte(simplified) ? "LEGAIS" : "SIMPLIFICADA", base: base.toFixed(2), preliminary: preliminary.toFixed(2), reduction: reduction.toFixed(2), tax: preliminary.sub(reduction).toFixed(2), rraMonths: input.rraMonths ?? null, referenceDate: input.referenceDate, reductionPolicy: policy };
}

export const INCOME_TAX_2026_BANDS = [
  { lowerLimit: "0", upperLimit: "2428.80", employeeRate: "0", amountToDeduct: "0" },
  { lowerLimit: "2428.80", upperLimit: "2826.65", employeeRate: "7.5", amountToDeduct: "182.16" },
  { lowerLimit: "2826.65", upperLimit: "3751.05", employeeRate: "15", amountToDeduct: "394.16" },
  { lowerLimit: "3751.05", upperLimit: "4664.68", employeeRate: "22.5", amountToDeduct: "675.49" },
  { lowerLimit: "4664.68", upperLimit: null, employeeRate: "27.5", amountToDeduct: "908.73" },
];
export const INCOME_TAX_2026_REDUCTION = { origin: "IRRF_REDUCAO_MENSAL", effectiveFrom: "2026-01-01", effectiveUntil: null, exemptIncomeLimit: "5000", reductionIncomeLimit: "7350", maximumReduction: "312.89", linearConstant: "978.62", linearFactor: "0.133145", legalReference: "Lei 15.270/2025; RFB 2026; pacote RH T13–T15. Conferir enquadramento na implantação." };
