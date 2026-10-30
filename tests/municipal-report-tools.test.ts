import test from "node:test";
import assert from "node:assert/strict";
import { validateDecennialCut, decennialEducationSummary } from "../src/lib/financeiro/education-decennial";
import { parseReportPresets, reportPresetSchema } from "../src/lib/financeiro/report-preset";
test("corte decendial aceita fim do mês e rejeita dias comuns e datas inválidas", () => {
  assert.equal(validateDecennialCut("2024-02-29").toISOString(), "2024-02-29T23:59:59.999Z");
  assert.equal(validateDecennialCut("2024-02-10").getUTCDate(), 10);
  assert.throws(() => validateDecennialCut("2024-02-11"), /dia 10, 20/);
  assert.throws(() => validateDecennialCut("2025-02-29"), /inválida/);
  assert.throws(() => validateDecennialCut("2099-02-10"), /não foi encerrado/);
});
test("demonstrativo mantém caráter preliminar e não divide base zero", () => {
  assert.equal(decennialEducationSummary({ numerator: "250.00", denominator: "1000.00", minimum: "25" }).preliminaryPercentage, "25.0000");
  assert.equal(decennialEducationSummary({ numerator: "1", denominator: "0", minimum: null }).preliminaryPercentage, null);
  assert.equal(decennialEducationSummary({ numerator: null, denominator: null, minimum: null }).provisional, true);
});
test("presets de relatórios rejeitam modelos arbitrários e preservam inatividade", () => {
  const preset = { id: "preset-1", name: "Relatório gerencial", purpose: "Consulta", reportType: "RGF", format: "CSV", active: false };
  assert.equal(reportPresetSchema.safeParse({ ...preset, reportType: "SQL_ARBITRARIO" }).success, false);
  assert.equal(reportPresetSchema.safeParse({ ...preset, format: "exe" }).success, false);
  assert.deepEqual(parseReportPresets([preset, 0, null, { unrelated: true }]), [preset]);
});
