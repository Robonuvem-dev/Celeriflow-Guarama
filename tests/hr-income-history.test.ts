import test from "node:test";
import assert from "node:assert/strict";
import { calculateIncomeHistory2025, incomeHistorySchema } from "../src/lib/rh/income-history";

test("Histórico 2025: tabelas de janeiro/abril e maio/novembro, sem a redução de 2026", () => {
  const rows = calculateIncomeHistory2025("3000.00");
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[0], { competence: "01/2025", paymentDate: "2025-01-31", gross: "3000.00", socialContribution: "253.41", incomeTax: "13.20", net: "2733.39" });
  assert.equal(rows[3].incomeTax, "13.20");
  assert.equal(rows[4].incomeTax, "0.00");
  assert.equal(rows[10].paymentDate, "2025-11-30");
  const high = calculateIncomeHistory2025("10000.00");
  assert.equal(high[0].socialContribution, "951.63");
  assert.equal(high[0].incomeTax, "1592.30");
  assert.equal(high[4].incomeTax, "1579.57");
  assert.equal(calculateIncomeHistory2025("5000.00")[4].incomeTax, "312.89");
});

test("Histórico anual exige onze competências distintas, pagamento no ano e conciliação dos valores", () => {
  const record = { version: 1, packageId: "history", year: 2025, anchorRunId: "december", employeeId: "holder", personId: "person", contractId: "contract", cpf: "00000000000", name: "Titular", estimated: true, actualBankSettlement: false, months: calculateIncomeHistory2025("3000.00") };
  assert.ok(incomeHistorySchema.safeParse(record).success);
  assert.equal(incomeHistorySchema.safeParse({ ...record, months: record.months.slice(0, 10) }).success, false);
  assert.equal(incomeHistorySchema.safeParse({ ...record, months: record.months.map((month, index) => index === 10 ? record.months[0] : month) }).success, false);
  assert.equal(incomeHistorySchema.safeParse({ ...record, months: record.months.map((month, index) => index === 0 ? { ...month, paymentDate: "2026-01-31" } : month) }).success, false);
  assert.equal(incomeHistorySchema.safeParse({ ...record, months: record.months.map((month, index) => index === 0 ? { ...month, net: "9999.00" } : month) }).success, false);
});
