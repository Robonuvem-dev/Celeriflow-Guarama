import { Decimal } from "@/db/decimal";
import type { Decimal as DecimalJs } from "decimal.js";
import { z } from "zod";
import { allocatePayrollAmount } from "./calculation-engine";

const itemSchema = z.object({ code: z.string(), type: z.string(), value: z.string() });
const schema = z.object({ items: z.array(itemSchema), proration: z.object({ segments: z.array(z.object({ calendarDays: z.number().positive(), costCenterId: z.string().nullable(), workLocation: z.string(), items: z.array(itemSchema) })).min(1) }) });

/** Original rubric slices retain their historical locations. Added taxes,
 * pensions and employer charges use remuneration weights, with day fallback. */
export function allocateProratedStatementLocations(snapshot: unknown, employer: DecimalJs.Value) {
  const parsed = schema.parse(snapshot);
  const parts = parsed.proration.segments.map(segment => ({ costCenterId: segment.costCenterId, workLocation: segment.workLocation, calendarDays: segment.calendarDays, items: segment.items.map(item => ({ ...item })) }));
  const grossWeights = parts.map(part => part.items.filter(item => item.type === "PROVENTO").reduce((sum, item) => sum.add(item.value), new Decimal(0)));
  const weights = grossWeights.some(value => value.gt(0)) ? grossWeights : parts.map(part => new Decimal(part.calendarDays));
  for (const item of parsed.items) {
    const original = parts.map(part => part.items.find(candidate => candidate.code === item.code));
    if (original.every(candidate => candidate !== undefined)) {
      if (!original.reduce((sum, candidate) => sum.add(candidate!.value), new Decimal(0)).eq(item.value)) throw new Error("Rubrica rateada não concilia com a memória consolidada.");
    } else {
      if (original.some(candidate => candidate !== undefined)) throw new Error("Rubrica com rateio incompleto.");
      const shares = allocatePayrollAmount(new Decimal(item.value), weights);
      parts.forEach((part, index) => part.items.push({ ...item, value: shares[index].toFixed(2) }));
    }
  }
  const charges = allocatePayrollAmount(new Decimal(employer), weights);
  return parts.map((part, index) => {
    const gross = part.items.filter(item => item.type === "PROVENTO").reduce((sum, item) => sum.add(item.value), new Decimal(0));
    const deductions = part.items.filter(item => item.type === "DESCONTO").reduce((sum, item) => sum.add(item.value), new Decimal(0));
    return { ...part, gross, deductions, net: gross.sub(deductions), employer: charges[index] };
  });
}
