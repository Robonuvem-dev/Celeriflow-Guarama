import assert from "node:assert/strict";
import test from "node:test";
import { calculateCemeteryEventFee, cemeteryEventDueDate, cemeteryFeeEventKey, cemeteryFeeRuleSchema } from "../src/lib/cemeteries/fees-engine";

test("fórmulas fechadas usam Decimal e arredondamento monetário", () => {
  assert.equal(calculateCemeteryEventFee("BASE_X_QUANTIDADE", "0.10", "3").amount.toFixed(2), "0.30");
  assert.equal(calculateCemeteryEventFee("BASE_X_QUANTIDADE", "0.01", "1.5").amount.toFixed(2), "0.02");
  assert.equal(calculateCemeteryEventFee("VALOR_FIXO", "12.34", "5").amount.toFixed(2), "12.34");
  for (const quantity of ["0", "-1", "NaN", "1.00001"]) assert.throws(() => calculateCemeteryEventFee("VALOR_FIXO", "1", quantity));
  assert.throws(() => calculateCemeteryEventFee("eval(process.exit())", "1"));
  assert.throws(() => calculateCemeteryEventFee("VALOR_FIXO", "1.001"));
});

test("vencimento usa dias UTC configurados e permite virada de exercício explícita", () => {
  assert.equal(cemeteryEventDueDate(new Date("2026-12-20T23:59:00Z"), 30).toISOString(), "2027-01-19T12:00:00.000Z");
  assert.throws(() => cemeteryEventDueDate(new Date(), -1));
  assert.throws(() => cemeteryEventDueDate(new Date("invalid"), 30));
});

test("eventos customizados não executam código e vigência é validada", () => {
  assert.equal(cemeteryFeeEventKey("limpeza_anual", "CONCESSAO", "123"), "CEMITERIOS:LIMPEZA_ANUAL:CONCESSAO:123");
  assert.throws(() => cemeteryFeeEventKey("alert(1)", "CONCESSAO", "123"));
  assert.throws(() => cemeteryFeeRuleSchema.parse({ eventType: "SEPULTAMENTO", label: "Taxa", formula: "VALOR_FIXO", baseAmount: "10.00", dueDays: 30, taxId: "tax", validFrom: "2026-10-01", validUntil: "2026-09-01", legalBasis: "Lei 123" }));
});
