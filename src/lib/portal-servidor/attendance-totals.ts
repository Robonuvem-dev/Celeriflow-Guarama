import { Prisma, type AttendanceRecord } from "@prisma/client";
import { z } from "zod";
export const attendanceTotalsPolicySchema = z.object({ origin: z.literal("TOTALIZADORES_PONTO_FUNCIONAL"), budgetUnitId: z.string().min(1), employeeIds: z.array(z.string()).default([]), totals: z.array(z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,50}$/), label: z.string().min(1).max(200), field: z.enum(["hoursWorked", "extraHours", "bankHours", "contractedHours", "RECORD_COUNT"]), statuses: z.array(z.string()).default([]) }).strict()).min(1).max(30) }).strict().refine(value => new Set(value.totals.map(total => total.code)).size === value.totals.length, "Totalizadores duplicados.");
export function configuredAttendanceTotals(rows: AttendanceRecord[], raw: unknown) {
  const policy = attendanceTotalsPolicySchema.parse(raw);
  return policy.totals.map(total => ({ code: total.code, label: total.label, value: rows.filter(row => !total.statuses.length || total.statuses.includes(row.status)).reduce((sum, row) => sum.add(total.field === "RECORD_COUNT" ? 1 : String(row[total.field])), new Prisma.Decimal(0)).toFixed(total.field === "RECORD_COUNT" ? 0 : 4) }));
}
