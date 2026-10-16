export type VaccineRule = { id: string; vaccineId: string; doseNumber: number; strategy: string; ageUnit: string; minimumAge: number; maximumAge: number | null; minimumIntervalDays: number; repeatEveryMonths: number | null; required: boolean };
export type VaccineHistory = { id: string; vaccineId: string; doseNumber: number; strategy: string | null; date: Date; source: "APPLICATION" | "RESCUE" };
export type VaccineCardEvent = { id: string; vaccineId: string; doseNumber: number; kind: string; occurredAt: Date; until: Date | null; scheduledFor: Date | null; revokedAt: Date | null; reason: string };
const DAY = 86400000;
const brazilDayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });
export function vaccineStrategy(value: string | null) { return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase(); }
export function vaccineDay(date: Date) {
  if (!Number.isFinite(date.valueOf())) throw new Error("Data de vacinação inválida.");
  return Date.parse(`${brazilDayFormatter.format(date)}T12:00:00Z`);
}
export function vaccineLotExpiresAt(date: Date) { return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999-03:00`); }
function birthDay(date: Date) { return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12); }
export function vaccineAddMonths(date: Date, months: number) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last)); return target;
}
export function vaccineCalendarAge(birth: Date, at: Date, unit: string) {
  const reference = new Date(vaccineDay(at));
  if (unit === "DAY") return Math.floor((reference.valueOf() - birthDay(birth)) / DAY);
  let months = (reference.getUTCFullYear() - birth.getUTCFullYear()) * 12 + reference.getUTCMonth() - birth.getUTCMonth();
  if (vaccineAddMonths(birth, months).valueOf() > reference.valueOf()) months--;
  return unit === "YEAR" ? Math.floor(months / 12) : months;
}
function threshold(birth: Date, age: number, unit: string) { return unit === "DAY" ? new Date(birthDay(birth) + age * DAY) : vaccineAddMonths(birth, unit === "YEAR" ? age * 12 : age); }
export function vaccineDoseStatus(rule: VaccineRule, birth: Date, history: VaccineHistory[], events: VaccineCardEvent[], at: Date) {
  const age = vaccineCalendarAge(birth, at, rule.ageUnit), day = vaccineDay(at);
  const matching = history.filter(record => record.vaccineId === rule.vaccineId && vaccineStrategy(record.strategy) === vaccineStrategy(rule.strategy) && vaccineDay(record.date) <= day);
  const candidates = matching.filter(record => record.doseNumber === rule.doseNumber).sort((a, b) => b.date.valueOf() - a.date.valueOf());
  const invalidDoseIds: string[] = [];
  const completed = candidates.find(record => {
    const appliedAge = vaccineCalendarAge(birth, record.date, rule.ageUnit);
    if (appliedAge < rule.minimumAge || rule.maximumAge !== null && appliedAge > rule.maximumAge) { invalidDoseIds.push(record.id); return false; }
    if (rule.doseNumber <= 1) return true;
    const preceding = matching.filter(previous => previous.doseNumber === rule.doseNumber - 1 && vaccineDay(previous.date) <= vaccineDay(record.date)).sort((a, b) => b.date.valueOf() - a.date.valueOf())[0];
    if (!preceding || vaccineDay(record.date) - vaccineDay(preceding.date) < rule.minimumIntervalDays * DAY) { invalidDoseIds.push(record.id); return false; }
    return true;
  });
  let dueAt = threshold(birth, rule.minimumAge, rule.ageUnit);
  const preceding = matching.filter(record => record.doseNumber === rule.doseNumber - 1).sort((a, b) => b.date.valueOf() - a.date.valueOf())[0];
  if (preceding) dueAt = new Date(Math.max(dueAt.valueOf(), vaccineDay(preceding.date) + rule.minimumIntervalDays * DAY));
  const activeEvents = events.filter(event => event.vaccineId === rule.vaccineId && (event.doseNumber === 0 || event.doseNumber === rule.doseNumber) && event.occurredAt <= at && (!event.revokedAt || event.revokedAt > at));
  const contraindication = activeEvents.filter(event => event.kind === "CONTRAINDICATION" && (!event.until || event.until > at)).sort((a, b) => b.occurredAt.valueOf() - a.occurredAt.valueOf())[0];
  const scheduled = activeEvents.filter(event => event.kind === "SCHEDULED").sort((a, b) => b.occurredAt.valueOf() - a.occurredAt.valueOf())[0];
  let status: "UP_TO_DATE" | "NOT_DUE" | "OUT_OF_RANGE" | "CONTRAINDICATED" | "MISSING_PREVIOUS" | "DUE";
  if (completed && !rule.repeatEveryMonths) status = "UP_TO_DATE";
  else {
    if (completed && rule.repeatEveryMonths) dueAt = vaccineAddMonths(new Date(vaccineDay(completed.date)), rule.repeatEveryMonths);
    status = completed && day < dueAt.valueOf() ? "UP_TO_DATE" : age < rule.minimumAge || day < dueAt.valueOf() ? "NOT_DUE" : rule.maximumAge !== null && age > rule.maximumAge ? "OUT_OF_RANGE" : contraindication ? "CONTRAINDICATED" : rule.doseNumber > 1 && !preceding ? "MISSING_PREVIOUS" : "DUE";
  }
  return { ruleId: rule.id, vaccineId: rule.vaccineId, doseNumber: rule.doseNumber, strategy: rule.strategy, required: rule.required, status, dueAt, completedRecordId: completed?.id || null, contraindicationId: contraindication?.id || null, scheduledFor: scheduled?.scheduledFor || null, invalidDoseIds, pending: rule.required && (status === "DUE" || status === "MISSING_PREVIOUS") };
}
