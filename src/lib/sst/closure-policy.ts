import { z } from "zod";
import { sstCivilDate } from "./aso-policy";
export const closureInput = z.object({
  employeeId: z.string().min(1), budgetUnitId: z.string().min(1),
  from: sstCivilDate, until: sstCivilDate,
}).refine((value) => value.from < value.until, "Informe período com limite final exclusivo posterior ao início.");
export type HistoryInterval = { startsAt: Date; endsAt: Date };
/** Half-open intervals. Missing history is distinct from no exposure. */
export function missingPeriods(from: Date, until: Date, intervals: HistoryInterval[]) {
  const ordered = intervals.map((entry) => ({ startsAt: new Date(Math.max(from.getTime(), entry.startsAt.getTime())), endsAt: new Date(Math.min(until.getTime(), entry.endsAt.getTime())) })).filter((entry) => entry.startsAt < entry.endsAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const missing: HistoryInterval[] = [];
  let cursor = from;
  for (const entry of ordered) {
    if (entry.startsAt > cursor) missing.push({ startsAt: cursor, endsAt: entry.startsAt });
    if (entry.endsAt > cursor) cursor = entry.endsAt;
  }
  if (cursor < until) missing.push({ startsAt: cursor, endsAt: until });
  return missing;
}
export function closurePage(value: number, total: number) {
  return Math.min(Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1, Math.max(1, Math.ceil(total / 20)));
}
