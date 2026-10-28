import { Decimal } from "@/db/decimal";
import { z } from "zod";

export const LeaveExactDecimal = Decimal.clone({ precision: 48 });
export const leaveMonetaryCalculation = z.object({
  version: z.literal(1), mode: z.literal("RATE_PER_ATTESTED_MINUTE"), currency: z.literal("BRL"),
  rateBRLPerMinute: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/).refine((v) => new LeaveExactDecimal(v).gt(0), "Tarifa deve ser positiva e explicitamente aprovada."),
  rounding: z.object({ mode: z.literal("HALF_UP"), scale: z.literal(2) }).strict(),
  legalReference: z.string().trim().min(3).max(1000), sourceReference: z.string().trim().min(10).max(1000),
}).strict();
export const leaveReversalMapping = z.object({ rubricId: z.string().min(1), eventId: z.string().min(1), legalReference: z.string().trim().min(3).max(1000) }).strict();
export const leavePostingInput = z.object({ certificateId: z.string().min(1), payrollId: z.string().min(1), ruleId: z.string().min(1) }).strict();
export const leaveReversalInput = z.object({ originId: z.string().min(1), payrollId: z.string().min(1), ruleId: z.string().min(1), reason: z.string().trim().min(10).max(1000) }).strict();
