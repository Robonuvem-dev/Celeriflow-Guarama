import test from "node:test";
import assert from "node:assert/strict";
import { calculateServiceAcquisitions } from "../src/lib/rh/service-rights";
import { calculateServiceTimeAllowance } from "../src/lib/rh/service-time-allowance";
import { calculatePayrollProvisions } from "../src/lib/rh/payroll-provisions";
import { calculateTimeBankLots } from "../src/lib/rh/time-bank-expiration";

const policy = { origin: "LICENCA_PREMIO", acquisitionDays: 10, entitlementDays: 5, minSplitDays: 1, maxSplits: 5, allowsCash: true, maxCashDays: 2, legalReference: "Regra sintética POC", absences: [{ type: "Suspensão", effect: "SUSPENDER" }, { type: "Perda", effect: "REINICIAR" }, { type: "Neutro", effect: "CONTAR" }] };
test("licença-prêmio conta dias civis, união de suspensões e reinício explícito sem duplicar dias", () => {
  const assessment = calculateServiceAcquisitions(new Date("2026-01-01"), new Date("2026-01-25"), policy, [
    { type: "Suspensão", startDate: new Date("2026-01-03"), endDate: new Date("2026-01-05") },
    { type: "Suspensão", startDate: new Date("2026-01-04"), endDate: new Date("2026-01-06") },
  ]);
  assert.equal(assessment.periods[0].periodEnd.toISOString().slice(0, 10), "2026-01-14");
  assert.equal(assessment.periods[0].suspendedDays, 4);
  assert.equal(assessment.periods[1].periodStart.toISOString().slice(0, 10), "2026-01-15");
  const reset = calculateServiceAcquisitions(new Date("2026-01-01"), new Date("2026-01-25"), policy, [{ type: "Perda", startDate: new Date("2026-01-07"), endDate: new Date("2026-01-08") }]);
  assert.equal(reset.periods[0].periodStart.toISOString().slice(0, 10), "2026-01-09");
  assert.equal(reset.periods[0].periodEnd.toISOString().slice(0, 10), "2026-01-18");
  assert.equal(reset.pending.countedDays, 7);
  assert.throws(() => calculateServiceAcquisitions(new Date("2026-01-01"), new Date("2026-01-25"), policy, [{ type: "Sem política", startDate: new Date("2026-01-02"), endDate: new Date("2026-01-03") }]), /Defina o efeito/);
});

test("ATS une afastamentos não computáveis, aplica averbação e faixa explícita com Decimal", () => {
  const ats = { origin: "ATS", rubricCode: "ATS", basis: "SALARIO_TEMPORAL", legalReference: "ATS sintético", tiers: [{ minimumDays: 15, rate: "7.5" }, { minimumDays: 30, rate: "10" }], absences: [{ type: "Sem contagem", counts: false }] };
  const result = calculateServiceTimeAllowance(ats, { admittedAt: new Date("2026-01-01"), through: new Date("2026-01-31"), salary: "1500.01", creditedDays: 5, absences: [{ type: "Sem contagem", startDate: new Date("2026-01-01"), endDate: new Date("2026-01-05") }, { type: "Sem contagem", startDate: new Date("2026-01-03"), endDate: new Date("2026-01-07") }] });
  assert.equal(result.excludedDays, 7);
  assert.equal(result.countedDays, 29);
  assert.equal(result.rate, "7.5");
  assert.equal(result.amount, "112.50");
});

test("provisão preserva base, remuneração e patronal separados e arredonda HALF_UP", () => {
  const rows = calculatePayrollProvisions({ contract: { registration: "POC", costCenterId: null }, items: [{ code: "SALARIO", type: "PROVENTO", value: "1500.01" }] }, { origin: "PROVISOES_FOLHA", legalReference: "Política sintética", components: [{ kind: "PROVISAO_13", rubricCodes: ["SALARIO"], rate: "8.33333333", employerRate: "20" }] });
  assert.equal(rows[0].remuneration, "125.00");
  assert.equal(rows[0].employer, "25.00");
  assert.equal(rows[0].total, "150.00");
});

test("FIFO transfere lotes conservando aquisição e elimina pares de estorno sem rejuvenescer horas", () => {
  const credit = { id: "credit", contractId: "a", periodStart: new Date("2026-01-01"), quantity: "1.0001", details: {} };
  const output = { id: "out", contractId: "a", periodStart: new Date("2026-02-01"), quantity: "-0.5001", details: { operation: "TRANSFERENCIA", transferSourceKey: "move", otherContractId: "b" } };
  const input = { id: "in", contractId: "b", periodStart: new Date("2026-02-01"), quantity: "0.5001", details: { operation: "TRANSFERENCIA", transferSourceKey: "move", otherContractId: "a" } };
  const lots = calculateTimeBankLots([credit, output, input], new Date("2026-03-01"));
  assert.equal(lots.find(row => row.contractId === "b")?.acquiredAt.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(lots.find(row => row.contractId === "a")?.hours.toString(), "0.5");
  const restored = calculateTimeBankLots([credit, output, input, { ...output, id: "reverse-out", quantity: "0.5001", details: { originalEntryId: "out" } }, { ...input, id: "reverse-in", quantity: "-0.5001", details: { originalEntryId: "in" } }], new Date("2026-03-01"));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].hours.toString(), "1.0001");
  assert.throws(() => calculateTimeBankLots([output, input], new Date("2026-03-01")), /sem saldo/);
});
