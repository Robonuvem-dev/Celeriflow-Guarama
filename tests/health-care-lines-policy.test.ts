import assert from "node:assert/strict";
import test from "node:test";
import { ADULT_TEETH, CHILD_TEETH, assertDentalTarget, pregnancyDating } from "../src/lib/saude/care-lines-policy";

test("datação gestacional preserva DPP entre consultas e usa referência do ultrassom", () => {
  const input = { calculationMethod: "LMP" as const, lastMenstrualDate: new Date("2026-01-01T12:00:00Z"), ultrasoundDate: null, ultrasoundGestationalDays: null };
  const first = pregnancyDating(input, new Date("2026-04-08T12:00:00Z"));
  const next = pregnancyDating(input, new Date("2026-04-09T23:00:00Z"));
  assert.equal(first.trimester, 1); assert.equal(next.trimester, 2);
  assert.equal(first.estimatedDeliveryDate.valueOf(), next.estimatedDeliveryDate.valueOf());
  const ultrasound = pregnancyDating({ calculationMethod: "ULTRASOUND", lastMenstrualDate: null, ultrasoundDate: new Date("2026-02-01"), ultrasoundGestationalDays: 60 }, new Date("2026-02-08"));
  assert.equal(ultrasound.gestationalDays, 67); assert.equal(ultrasound.weeks, 9); assert.equal(ultrasound.days, 4);
  assert.throws(() => pregnancyDating(input, new Date("2025-12-31")), /data-base/);
});

test("odontograma diferencia dentes permanentes, decíduos e regiões", () => {
  assert.equal(new Set(ADULT_TEETH).size, 32); assert.equal(new Set(CHILD_TEETH).size, 20);
  assertDentalTarget("ADULT", "TOOTH", "48"); assertDentalTarget("CHILD", "TOOTH", "85"); assertDentalTarget("BOTH", "TOOTH", "55");
  assert.throws(() => assertDentalTarget("ADULT", "TOOTH", "55"));
  assert.throws(() => assertDentalTarget("CHILD", "TOOTH", "18"));
  assertDentalTarget("BOTH", "SEXTANT", "6"); assertDentalTarget("BOTH", "MOUTH", "ALL");
  assert.throws(() => assertDentalTarget("BOTH", "QUADRANT", "6"));
  assert.throws(() => assertDentalTarget("BOTH", "ARCH", "ALL"));
});
