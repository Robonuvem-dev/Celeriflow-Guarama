import assert from "node:assert/strict";
import test from "node:test";
import { serializePlanningItems, serializePlanningMappings, validatePlanningItems, validatePlanningMappings, type PlanningDraftItem } from "./planning-drafts";

const items = (count: number): PlanningDraftItem[] => Array.from({ length: count }, (_, index) => ({ id: index, code: `D${index + 1}`, direction: index % 2 ? "-" : "+", value: index + .25 }));

test("payload conserva os 41 itens, incluindo edição fora da primeira página e remoção por id estável", () => {
  const rows = items(41);
  rows[20].value = 987.65;
  const payload = serializePlanningItems(rows.filter(row => row.id !== 2));
  assert.equal(payload.split("\n").length, 40);
  assert.ok(payload.includes("D21;+;987.65"));
  assert.ok(payload.endsWith("D41;+;40.25"));
  assert.ok(!payload.split("\n").some(row => row.startsWith("D3;")));
});

test("validação aponta o campo e índice do item 21 antes da submissão", () => {
  const rows = items(21);
  rows[20].value = 0;
  assert.deepEqual(validatePlanningItems(rows), { index: 20, field: "value", message: "Item 21: informe valor maior que zero, com até 15 dígitos inteiros." });
  rows[20].value = 12;
  rows[20].code = "D1";
  assert.equal(validatePlanningItems(rows)?.field, "code");
  rows[20].code = "D21";
  assert.equal(validatePlanningItems(rows), undefined);
});

test("mapeamento transmite todos os destinos e códigos novos, sem limitar à página visível", () => {
  const definitions = Array.from({ length: 41 }, (_, index) => ({ sourceLineId: `S${index}`, label: `Origem ${index}`, newCode: `N${index}`, targets: [{ id: `T${index}`, name: `Destino ${index}` }] }));
  const codes = Object.fromEntries(definitions.map(row => [row.sourceLineId, row.newCode]));
  const selected = { S20: "T20", S40: "T40" };
  const payload = JSON.parse(serializePlanningMappings(definitions, selected, codes));
  assert.equal(payload.length, 41);
  assert.deepEqual(payload[20], { sourceLineId: "S20", targetLineId: "T20" });
  assert.deepEqual(payload[21], { sourceLineId: "S21", targetLineId: null, newCode: "N21" });
  assert.deepEqual(payload[40], { sourceLineId: "S40", targetLineId: "T40" });
  assert.equal(validatePlanningMappings(definitions, selected, codes), undefined);
  codes.S21 = " ";
  assert.equal(validatePlanningMappings(definitions, selected, codes)?.index, 21);
  assert.equal(validatePlanningMappings(definitions, selected, codes)?.field, "newCode");
});

test("novo código vazio só é permitido quando há destino válido selecionado", () => {
  const definitions = [{ sourceLineId: "S", label: "Classificação", newCode: "", targets: [{ id: "T", name: "Existente" }] }];
  assert.equal(validatePlanningMappings(definitions, { S: "T" }, { S: "" }), undefined);
  assert.equal(validatePlanningMappings(definitions, { S: "outro" }, { S: "" })?.field, "target");
  assert.equal(validatePlanningMappings(definitions, { S: "" }, { S: "" })?.field, "newCode");
});
