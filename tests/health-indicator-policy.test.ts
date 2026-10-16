import assert from "node:assert/strict";
import test from "node:test";
import { indicatorPercentage, indicatorPeriod } from "../src/lib/saude/health-indicator-service";
import { consultationKind } from "../src/lib/saude/indicator-context";

test("Indicadores: denominador vazio não representa cobertura de zero por cento", () => {
  assert.equal(indicatorPercentage(0, 0), null);
  assert.equal(indicatorPercentage(0, 5), 0);
  assert.equal(indicatorPercentage(1, 3), 33.33);
});
test("Indicadores: recorte mensal tem limite superior exclusivo e referência no último dia", () => {
  const leap = indicatorPeriod("2024-02");
  assert.equal(leap.gte.toISOString(), "2024-02-01T03:00:00.000Z");
  assert.equal(leap.lt.toISOString(), "2024-03-01T03:00:00.000Z");
  assert.equal(leap.referenceDay.toISOString().slice(0, 10), "2024-02-29");
  assert.equal(indicatorPeriod("2025-12").lt.toISOString(), "2026-01-01T03:00:00.000Z");
  for (const value of ["2024-00", "2024-13", "0001-01", "2024-1"]) assert.throws(() => indicatorPeriod(value));
});
test("Séries: profissão sem CBO não é presumida como consulta médica", () => {
  assert.equal(consultationKind("2251-25"), "MEDICAL");
  assert.equal(consultationKind("223208"), "DENTAL");
  assert.equal(consultationKind("223505"), "OTHER");
  assert.equal(consultationKind(null), "OTHER");
});
