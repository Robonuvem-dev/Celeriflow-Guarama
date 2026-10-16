import assert from "node:assert/strict";
import test from "node:test";
import { vaccineCalendarAge, vaccineDoseStatus, vaccineLotExpiresAt, type VaccineCardEvent, type VaccineHistory, type VaccineRule } from "../src/lib/saude/vaccination-card-policy";
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const rule: VaccineRule = { id: "rule", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", ageUnit: "YEAR", minimumAge: 0, maximumAge: null, minimumIntervalDays: 30, repeatEveryMonths: null, required: true };
const birth = date("2000-01-01");
test("idade vacinal respeita fim de mês e aniversário de ano bissexto", () => {
  assert.equal(vaccineCalendarAge(date("2026-01-31"), date("2026-02-28"), "MONTH"), 1);
  assert.equal(vaccineCalendarAge(date("2024-02-29"), date("2025-02-28"), "YEAR"), 1);
  assert.equal(vaccineCalendarAge(date("2026-01-01"), date("2026-01-02"), "DAY"), 1);
});
test("aprazamento não substitui aplicação e mantém pendência vencida", () => {
  const scheduled: VaccineCardEvent = { id: "scheduled", vaccineId: "vaccine", doseNumber: 1, kind: "SCHEDULED", occurredAt: date("2026-01-01"), scheduledFor: date("2026-02-01"), until: null, revokedAt: null, reason: "Agendado" };
  const result = vaccineDoseStatus(rule, birth, [], [scheduled], date("2026-01-15"));
  assert.equal(result.pending, true); assert.equal(result.status, "DUE"); assert.equal(result.scheduledFor?.valueOf(), scheduled.scheduledFor?.valueOf());
});
test("resgate histórico compõe a carteira sem ser confundido com indicação", () => {
  const rescued: VaccineHistory = { id: "rescue", vaccineId: "vaccine", doseNumber: 1, strategy: "Rotina", date: date("2026-01-01"), source: "RESCUE" };
  assert.equal(vaccineDoseStatus(rule, birth, [rescued], [], date("2026-01-15")).status, "UP_TO_DATE");
  assert.equal(vaccineDoseStatus({ ...rule, strategy: "CAMPANHA" }, birth, [rescued], [], date("2026-01-15")).pending, true);
});
test("contraindicação com vigência e revogação preserva situação na data de referência", () => {
  const event: VaccineCardEvent = { id: "contra", vaccineId: "vaccine", doseNumber: 0, kind: "CONTRAINDICATION", occurredAt: date("2026-01-01"), scheduledFor: null, until: null, revokedAt: date("2026-01-10"), reason: "Condição avaliada" };
  assert.equal(vaccineDoseStatus(rule, birth, [], [event], date("2026-01-05")).status, "CONTRAINDICATED");
  assert.equal(vaccineDoseStatus(rule, birth, [], [event], date("2026-01-15")).pending, true);
});
test("dose anterior e intervalo são exigidos; dose histórica precoce não quita a exigência", () => {
  const second = { ...rule, doseNumber: 2 };
  assert.equal(vaccineDoseStatus(second, birth, [], [], date("2026-01-15")).status, "MISSING_PREVIOUS");
  const first: VaccineHistory = { id: "first", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", date: date("2026-01-01"), source: "APPLICATION" };
  assert.equal(vaccineDoseStatus(second, birth, [first], [], date("2026-01-15")).status, "NOT_DUE");
  const early = { ...first, id: "early", doseNumber: 2, date: date("2026-01-10") };
  const result = vaccineDoseStatus(second, birth, [first, early], [], date("2026-02-15"));
  assert.equal(result.pending, true); assert.deepEqual(result.invalidDoseIds, ["early"]);
});
test("repetição anual vence pela data registrada e lote vale até o fim da data local", () => {
  const previous: VaccineHistory = { id: "annual", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", date: date("2025-01-15"), source: "APPLICATION" };
  assert.equal(vaccineDoseStatus({ ...rule, repeatEveryMonths: 12 }, birth, [previous], [], date("2026-01-14")).status, "UP_TO_DATE");
  assert.equal(vaccineDoseStatus({ ...rule, repeatEveryMonths: 12 }, birth, [previous], [], date("2026-01-15")).pending, true);
  assert.equal(vaccineLotExpiresAt(new Date("2026-10-15")).toISOString(), "2026-10-16T02:59:59.999Z");
});
