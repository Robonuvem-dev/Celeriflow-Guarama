import assert from "node:assert/strict";
import { test } from "node:test";
import { itbiPartiesError, itbiPartiesPayload, onlineItbiSubmissionFields, updateItbiParty, type ItbiPartyDraft } from "./party-drafts";

const parties = (count: number, prefix: string): ItbiPartyDraft[] => Array.from({ length: count }, (_, index) => ({ draftId: `${prefix}-${index}`, document: String(10000000000 + index), sharePercent: index === count - 1 ? 20 : 80 / (count - 1) }));

test("FormData mantém modalidade, fração e devedor com todos os titulares, inclusive os fora da página", () => {
  let sellers = parties(41, "seller");
  const buyers = parties(21, "buyer");
  const onlyVisible = sellers.filter((row) => row.draftId === "seller-40");
  sellers = updateItbiParty(sellers, onlyVisible[0].draftId, { sharePercent: 20.123456 });
  sellers = updateItbiParty(sellers, "seller-0", { sharePercent: 1.876544 });
  const form = new FormData();
  for (const [key, value] of Object.entries({ type: "modalidade-aliquota-municipal", value: "123456.78", fraction: "12.345678", debtor: sellers[40].document, contestation: "Impugnação integral", description: "Transmissão com múltiplos titulares" })) form.set(key, value);
  form.set("sellers", JSON.stringify(itbiPartiesPayload(sellers)));
  form.set("buyers", JSON.stringify(itbiPartiesPayload(buyers)));
  const payload = onlineItbiSubmissionFields(form, sellers, buyers);
  assert.equal(payload.transactionTypeId, "modalidade-aliquota-municipal");
  assert.equal(payload.declaredValue, 123456.78);
  assert.equal(payload.fractionPercent, 12.345678);
  assert.equal(payload.debtorDocument, sellers[40].document);
  assert.equal(payload.sellers.length, 41);
  assert.equal(payload.buyers.length, 21);
  assert.equal(payload.sellers[40].sharePercent, 20.123456);
  assert.equal(payload.sellers[0].sharePercent, 1.876544);
  assert.ok(Math.abs(payload.sellers.reduce((total, row) => total + row.sharePercent, 0) - 100) < 0.000001);
  assert.deepEqual(payload.sellers, JSON.parse(String(form.get("sellers"))));
  assert.deepEqual(payload.buyers, JSON.parse(String(form.get("buyers"))));
  assert.equal(payload.contestationReason, "Impugnação integral");
  assert.equal(itbiPartiesError(sellers, "Transmitentes"), null);
});

test("editar depois de remover e filtrar usa identidade estável, sem trocar titulares nem percentuais", () => {
  const original = parties(41, "seller");
  const remaining = original.filter((row) => row.draftId !== "seller-0");
  const edited = updateItbiParty(remaining, "seller-30", { document: "12.345.678/0001-90", sharePercent: 3.141592 });
  const payload = itbiPartiesPayload(edited);
  assert.equal(payload.length, 40);
  assert.deepEqual(payload[29], { document: "12.345.678/0001-90", sharePercent: 3.141592 });
  assert.deepEqual(payload[30], { document: original[31].document, sharePercent: original[31].sharePercent });
  assert.ok(payload.every((row) => !("draftId" in row)));
});

test("partes inválidas fora da página são validadas antes do envio sem resetar os arrays", () => {
  const rows = parties(41, "buyer");
  const invalidShare = updateItbiParty(rows, "buyer-40", { sharePercent: 0 });
  assert.match(itbiPartiesError(invalidShare, "Adquirentes") || "", /parte 41.*participação/);
  const invalidDocument = updateItbiParty(rows, "buyer-40", { document: "" });
  assert.match(itbiPartiesError(invalidDocument, "Adquirentes") || "", /parte 41.*CPF ou CNPJ/);
  assert.equal(invalidDocument.length, 41);
  assert.equal(invalidDocument[0].document, rows[0].document);
  const invalidStep = updateItbiParty(rows, "buyer-40", { sharePercent: 1.1234567 });
  assert.match(itbiPartiesError(invalidStep, "Adquirentes") || "", /parte 41.*seis casas/);
  assert.equal(invalidStep[40].sharePercent, 1.1234567);
});
