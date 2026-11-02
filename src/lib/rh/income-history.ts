import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { calculateContribution } from "./calculation-engine";
import { calculateIncomeTax, INCOME_TAX_2026_BANDS } from "./income-tax";

export const incomeHistoryMonthSchema = z.object({
  competence: z.string().regex(/^(0[1-9]|1[01])\/2025$/),
  paymentDate: z.iso.date(), gross: z.string(), socialContribution: z.string(), incomeTax: z.string(), net: z.string(),
});
export const incomeHistorySchema = z.object({
  version: z.literal(1), packageId: z.string(), year: z.literal(2025), anchorRunId: z.string(),
  employeeId: z.string(), personId: z.string(), contractId: z.string(), cpf: z.string(), name: z.string(),
  estimated: z.literal(true), actualBankSettlement: z.literal(false),
  months: z.array(incomeHistoryMonthSchema).length(11),
}).superRefine((record, context) => {
  if (new Set(record.months.map(month => month.competence)).size !== 11) context.addIssue({ code: "custom", message: "Competências do histórico anual repetidas." });
  for (const month of record.months) {
    if (month.paymentDate.slice(0, 4) !== "2025" || month.paymentDate.slice(5, 7) !== month.competence.slice(0, 2)) context.addIssue({ code: "custom", message: "Pagamento fora da competência do histórico." });
    const amounts = [month.gross, month.socialContribution, month.incomeTax, month.net];
    if (amounts.some(value => !/^\d+\.\d{2}$/.test(value))) { context.addIssue({ code: "custom", message: "Valores monetários inválidos no histórico." }); continue; }
    if (!new Decimal(month.gross).sub(month.socialContribution).sub(month.incomeTax).eq(month.net)) context.addIssue({ code: "custom", message: "Histórico anual não conciliado." });
  }
});

export const SOCIAL_SECURITY_2025_BANDS = [
  { lowerLimit: "0", upperLimit: "1518.00", employeeRate: "7.5" },
  { lowerLimit: "1518.00", upperLimit: "2793.88", employeeRate: "9" },
  { lowerLimit: "2793.88", upperLimit: "4190.83", employeeRate: "12" },
  { lowerLimit: "4190.83", upperLimit: null, employeeRate: "14" },
];
export const INCOME_TAX_EARLY_2025_BANDS = [
  { lowerLimit: "0", upperLimit: "2259.20", employeeRate: "0", amountToDeduct: "0" },
  { lowerLimit: "2259.20", upperLimit: "2826.65", employeeRate: "7.5", amountToDeduct: "169.44" },
  { lowerLimit: "2826.65", upperLimit: "3751.05", employeeRate: "15", amountToDeduct: "381.44" },
  { lowerLimit: "3751.05", upperLimit: "4664.68", employeeRate: "22.5", amountToDeduct: "662.77" },
  { lowerLimit: "4664.68", upperLimit: null, employeeRate: "27.5", amountToDeduct: "896.00" },
];

/** Opening history is independent of payroll runs: January–November only.
 * December and the thirteenth always come from their closed canonical runs. */
export function calculateIncomeHistory2025(salary: string) {
  return Array.from({ length: 11 }, (_, index) => {
    const month = index + 1, mm = String(month).padStart(2, "0");
    const gross = new Decimal(salary);
    const contribution = calculateContribution(gross, SOCIAL_SECURITY_2025_BANDS, "PROGRESSIVA", "8157.41");
    const paymentDate = new Date(Date.UTC(2025, month, 0)).toISOString().slice(0, 10);
    const tax = calculateIncomeTax({ income: gross, legalDeductions: contribution, simplifiedDeduction: month < 5 ? "564.80" : "607.20", bands: month < 5 ? INCOME_TAX_EARLY_2025_BANDS : INCOME_TAX_2026_BANDS, referenceDate: paymentDate });
    return { competence: `${mm}/2025`, paymentDate, gross: gross.toFixed(2), socialContribution: contribution.toFixed(2), incomeTax: tax.tax, net: gross.sub(contribution).sub(tax.tax).toFixed(2) };
  });
}
