import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/db/decimal";
import { allocateAccountingCents } from "../src/lib/rh/accounting-reports";
import { unionCivilDays } from "../src/lib/rh/retirement-reports";
import { matrix132Lines } from "../src/lib/rh/special-report-layouts";

// Prepared for F7. Covers monetary and civil-calendar invariants, not fixture implementation details.
test("rateios preservam centavos, sinal e destino determinístico dos resíduos", () => {
  const allocations = [{ id: "a", percentage: "33.333333" }, { id: "b", percentage: "33.333333" }, { id: "c", percentage: "33.333334" }];
  for (const cents of [0, 1, 2, 7, 101, 10003, 89741970, -1, -7, -10003]) {
    const origin = new Decimal(cents).div(100).toFixed(2);
    const parts = allocateAccountingCents(origin, allocations);
    assert.ok([...parts.values()].reduce((sum, part) => sum.plus(part), new Decimal(0)).eq(origin));
    assert.ok([...parts.values()].every(part => part.eq(part.toDecimalPlaces(2)) && (cents >= 0 ? part.gte(0) : part.lte(0))));
    const reversed = allocateAccountingCents(origin, [...allocations].reverse());
    for (const [id, amount] of parts) assert.ok(amount.eq(reversed.get(id)!));
  }
  assert.throws(() => allocateAccountingCents("1.00", [{ id: "a", percentage: "99.999999" }]), /100%/);
  assert.throws(() => allocateAccountingCents("1.001", [{ id: "a", percentage: "100" }]), /duas casas/);
});

test("contagem civil une vínculos simultâneos e contíguos e respeita o ano bissexto", () => {
  assert.equal(unionCivilDays([{ start: "2024-02-28", end: "2024-02-29" }, { start: "2024-02-29", end: "2024-03-01" }, { start: "2024-03-02", end: "2024-03-02" }, { start: "2024-03-04", end: "2024-03-04" }]), 5);
  assert.equal(unionCivilDays([]), 0);
  assert.throws(() => unionCivilDays([{ start: "2026-02-29", end: "2026-03-01" }]));
  assert.throws(() => unionCivilDays([{ start: "2026-03-02", end: "2026-03-01" }]), /inválido/);
});

test("modelo matricial mantém exatamente 132 bytes por linha sem truncar nomes longos", () => {
  const long = `João da Conceição ${"ALFABETO ".repeat(50)}`;
  const lines = matrix132Lines({ title: "Cartão — demonstração", headers: ["Servidor"], rows: [[long]] });
  for (const line of lines) assert.equal(Buffer.byteLength(line, "ascii"), 132);
  const joined = lines.join("").replace(/\s/g, "");
  assert.ok(joined.includes(long.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, "")));
});
