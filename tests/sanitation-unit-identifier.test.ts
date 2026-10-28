import assert from "node:assert/strict";
import test from "node:test";
import { consumerUnitPeriod, formatConsumerUnitIdentifier } from "../src/lib/saneamento/unit-identifier";
import { clampSanitationPage, parseSanitationQuery } from "../src/lib/saneamento/list-query";
import { getUnitAddress } from "../src/lib/saneamento/unit-address";

test("identificador usa mês de cadastro brasileiro na virada de ano", () => {
  assert.equal(consumerUnitPeriod(new Date("2027-01-01T02:59:59Z")), "202612");
  assert.equal(consumerUnitPeriod(new Date("2027-01-01T03:00:00Z")), "202701");
  assert.equal(formatConsumerUnitIdentifier("202610", 1), "20261000001");
  assert.equal(formatConsumerUnitIdentifier("202610", 99999), "20261099999");
  for (const sequence of [0, -1, 1.5, 100000]) assert.throws(() => formatConsumerUnitIdentifier("202610", sequence));
  assert.throws(() => formatConsumerUnitIdentifier("202613", 1));
});

test("paginação mantém 20 registros e corrige páginas inválidas ou fora do filtro", () => {
  const query = parseSanitationQuery({ page: "999", pageSize: "1000000", q: "  Acácias  " });
  assert.equal(query.pageSize, 20);
  assert.equal(query.q, "Acácias");
  assert.equal(clampSanitationPage(query, 41).page, 3);
  assert.equal(clampSanitationPage(query, 0).page, 1);
  assert.equal(parseSanitationQuery({ page: "NaN" }).page, 1);
});

test("endereços legados exibem rua e bairro, sem inventar CEP ou coluna cidade", () => {
  assert.deepEqual(getUnitAddress({ address: "Rua das Veredas, 100, Centro, Aurora das Veredas - MG" }), {
    streetAddress: "Rua das Veredas, 100", neighborhood: "Centro", postalCode: "",
  });
  assert.deepEqual(getUnitAddress({ address: "Antigo", streetAddress: "Rua Nova, 20", neighborhood: "Boa Vista", postalCode: "39100-000" }), {
    streetAddress: "Rua Nova, 20", neighborhood: "Boa Vista", postalCode: "39100-000",
  });
});
