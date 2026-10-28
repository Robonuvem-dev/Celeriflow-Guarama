import assert from "node:assert/strict";
import test from "node:test";
import { vaccineAddMonths, vaccineCalendarAge, vaccineDay, vaccineDoseStatus, vaccineLotExpiresAt, vaccineStrategy, type VaccineCardEvent, type VaccineHistory, type VaccineRule } from "../src/lib/saude/vaccination-card-policy";

const date = (value: string) => new Date(`${value}T12:00:00Z`);
const rule: VaccineRule = { id: "rule", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", ageUnit: "YEAR", minimumAge: 0, maximumAge: null, minimumIntervalDays: 30, repeatEveryMonths: null, required: true };
const birth = date("2000-01-01");

test("calendário mantém idade civil, fim de mês e aniversário bissexto em qualquer TZ", () => {
  assert.equal(vaccineCalendarAge(date("2026-01-31"), date("2026-02-28"), "MONTH"), 1);
  assert.equal(vaccineCalendarAge(date("2024-02-29"), date("2025-02-28"), "YEAR"), 1);
  assert.equal(vaccineCalendarAge(date("2026-01-01"), date("2026-01-02"), "DAY"), 1);
  assert.equal(vaccineAddMonths(date("2024-02-29"), 12).toISOString(), "2025-02-28T12:00:00.000Z");
});

test("aprazamento pendente e resgate preservam dose, estratégia e exigibilidade", () => {
  const scheduled: VaccineCardEvent = { id: "scheduled", vaccineId: "vaccine", doseNumber: 1, kind: "SCHEDULED", occurredAt: date("2026-01-01"), scheduledFor: date("2026-02-01"), until: null, revokedAt: null, reason: "Agendamento" };
  const status = vaccineDoseStatus(rule, birth, [], [scheduled], date("2026-01-15"));
  assert.equal(status.pending, true); assert.equal(status.status, "DUE"); assert.equal(status.scheduledFor?.valueOf(), scheduled.scheduledFor?.valueOf());
  const rescued: VaccineHistory = { id: "rescue", vaccineId: "vaccine", doseNumber: 1, strategy: "Rotina", date: date("2026-01-01"), source: "RESCUE" };
  assert.equal(vaccineDoseStatus(rule, birth, [rescued], [], date("2026-01-15")).status, "UP_TO_DATE");
  assert.equal(vaccineDoseStatus({ ...rule, strategy: "CAMPANHA" }, birth, [rescued], [], date("2026-01-15")).pending, true);
  assert.equal(vaccineStrategy("  Estratégia  "), "ESTRATEGIA");
});

test("contraindicação e revogação são avaliadas na referência histórica", () => {
  const event: VaccineCardEvent = { id: "contra", vaccineId: "vaccine", doseNumber: 0, kind: "CONTRAINDICATION", occurredAt: date("2026-01-01"), scheduledFor: null, until: null, revokedAt: date("2026-01-10"), reason: "Condição avaliada" };
  assert.equal(vaccineDoseStatus(rule, birth, [], [event], date("2026-01-05")).status, "CONTRAINDICATED");
  assert.equal(vaccineDoseStatus(rule, birth, [], [event], date("2026-01-15")).pending, true);
  assert.equal(vaccineDoseStatus(rule, birth, [], [{ ...event, revokedAt: null, until: date("2026-01-15") }], date("2026-01-15")).status, "DUE");
});

test("intervalo mínimo e dose anterior mantêm dose precoce inválida", () => {
  const second = { ...rule, doseNumber: 2 };
  assert.equal(vaccineDoseStatus(second, birth, [], [], date("2026-01-15")).status, "MISSING_PREVIOUS");
  const first: VaccineHistory = { id: "first", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", date: date("2026-01-01"), source: "APPLICATION" };
  assert.equal(vaccineDoseStatus(second, birth, [first], [], date("2026-01-15")).status, "NOT_DUE");
  const status = vaccineDoseStatus(second, birth, [first, { ...first, id: "early", doseNumber: 2, date: date("2026-01-10") }], [], date("2026-02-15"));
  assert.equal(status.pending, true); assert.deepEqual(status.invalidDoseIds, ["early"]);
  assert.equal(vaccineDoseStatus({ ...rule, minimumAge: 30 }, birth, [], [], date("2026-01-15")).status, "NOT_DUE");
  assert.equal(vaccineDoseStatus({ ...rule, maximumAge: 20 }, birth, [], [], date("2026-01-15")).status, "OUT_OF_RANGE");
});

test("repetição e validade obedecem dia brasileiro e preservam milissegundo final", () => {
  const previous: VaccineHistory = { id: "annual", vaccineId: "vaccine", doseNumber: 1, strategy: "ROTINA", date: date("2025-01-15"), source: "APPLICATION" };
  assert.equal(vaccineDoseStatus({ ...rule, repeatEveryMonths: 12 }, birth, [previous], [], date("2026-01-14")).status, "UP_TO_DATE");
  assert.equal(vaccineDoseStatus({ ...rule, repeatEveryMonths: 12 }, birth, [previous], [], date("2026-01-15")).pending, true);
  assert.equal(vaccineDay(new Date("2026-10-20T02:59:59.999Z")), date("2026-10-19").valueOf());
  assert.equal(vaccineDay(new Date("2026-10-20T03:00:00.000Z")), date("2026-10-20").valueOf());
  assert.equal(vaccineLotExpiresAt(new Date("2026-10-19T00:00:00Z")).toISOString(), "2026-10-20T02:59:59.999Z");
  assert.throws(() => vaccineDay(new Date("invalid")), /Data de vacinação inválida/);
});
