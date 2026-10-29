import assert from "node:assert/strict";
import test from "node:test";
import { budgetRowsError, creditItemsError, distributionError, distributionPayload, fiscalTermsError, submitDraft } from "./draft-rows";
import { checklistDraftError } from "../controle-interno/checklist-drafts";

test("conciliação: valida linha fora da página e envia todas as alocações sem mudar chave ou valores", async () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ statementItemId: `bank-${index}`, treasuryMovementId: `movement-${index}`, amount: "9007199254740993.01" }));
  rows[44] = { ...rows[44], amount: "" };
  const payload = { sessionId: "session", reason: "fundamento completo", idempotencyKey: "original-key", allocations: rows };
  let calls = 0;
  const send = async () => { calls++; assert.equal(payload.allocations.length, 45); assert.equal(payload.allocations[44].amount, "0.02"); assert.equal(payload.idempotencyKey, "original-key"); return { error: undefined, replay: true }; };
  const validate = (row: typeof rows[number]) => !row.amount ? "Valor obrigatório." : null;
  assert.deepEqual(await submitDraft(rows, validate, send), { error: "Linha 45: Valor obrigatório." });
  assert.equal(calls, 0);
  rows[44] = { ...rows[44], amount: "0.02" };
  const before = structuredClone(rows);
  assert.deepEqual(await submitDraft(rows, validate, send), { error: undefined, replay: true });
  assert.equal(calls, 1);
  assert.deepEqual(rows, before);
  assert.equal(rows[0].amount, "9007199254740993.01");
});

test("rateios: o payload mantém linhas de três páginas e precisão decimal após edição/remoção", () => {
  const rows = Array.from({ length: 43 }, (_, index) => ({ objectId: `object-${index}`, itemId: `item-${index}`, value: `${index}.123456789123456789` }));
  const edited = rows.map((row, index) => index === 42 ? { ...row, value: "999999999999999999.99" } : row).filter((_, index) => index !== 3);
  assert.equal(distributionError(edited), null);
  const amounts = distributionPayload(edited, false);
  const shares = distributionPayload(edited, true);
  assert.equal(amounts.length, 42);
  assert.equal(shares.length, 42);
  assert.equal(amounts[41].amount, "999999999999999999.99");
  assert.equal(shares[41].percentage, "999999999999999999.99");
  assert.equal(amounts[3].objectId, "object-4");
  assert.equal(rows[42].value, "42.123456789123456789");
  assert.match(distributionError(edited.map((row, index) => index === 40 ? { ...row, itemId: "" } : row)) ?? "", /^Linha 41:/);
});

test("crédito e LOA: não descartam silenciosamente linha inválida depois dos primeiros 20 itens", () => {
  const items = Array.from({ length: 21 }, (_, index) => ({ appropriationId: `dotacao-${index}`, type: index % 2 ? "Anulação" : "Acréscimo", value: index + 1 }));
  assert.equal(creditItemsError(items), null);
  assert.match(creditItemsError(items.map((row, index) => index === 20 ? { ...row, value: 0 } : row)) ?? "", /^Linha 21:/);
  assert.equal(items.length, 21);
  assert.equal(items.reduce((total, row) => total + row.value, 0), 231);
  const budgets = items.map((row, index) => ({ code: String(index), name: row.appropriationId, value: row.value }));
  assert.equal(budgetRowsError(budgets), null);
  assert.match(budgetRowsError(budgets.map((row, index) => index === 20 ? { ...row, name: "" } : row)) ?? "", /^Linha 21:/);
});

test("composição fiscal: valida a última página e conserva multisseleções e ausências opcionais", () => {
  const terms = Array.from({ length: 24 }, (_, index) => ({ label: `Componente ${index}`, accountIds: ["a", "b"], operation: "SUBTRACT", side: "CREDIT_NET", ...(index === 23 ? { budgetUnitIds: ["ug1", "ug2"], sourceTypes: ["PAYMENT"], functionCodes: ["10", "12"] } : {}) }));
  const before = structuredClone(terms);
  assert.equal(fiscalTermsError(terms), null);
  assert.deepEqual(terms, before);
  assert.equal(Object.hasOwn(terms[0], "budgetUnitIds"), false);
  assert.match(fiscalTermsError(terms.map((row, index) => index === 23 ? { ...row, accountIds: [] } : row)) ?? "", /^Linha 24:/);
  assert.deepEqual(terms[23].budgetUnitIds, ["ug1", "ug2"]);
});

test("checklist: preserva grupos/diagnóstico e verifica pergunta inválida em página posterior", () => {
  const groups = [0, 1].map(group => ({ name: `Grupo ${group}`, responses: ["Regular", "Irregular"], irregularResponse: "Irregular", items: Array.from({ length: 25 }, (_, index) => ({ number: group * 25 + index + 1, question: `Pergunta ${index}`, ...(index === 24 ? { diagnosticRule: "BANK_ACCOUNT_SOURCE" as const } : {}) })) }));
  const before = structuredClone(groups);
  assert.equal(checklistDraftError(groups), null);
  assert.deepEqual(groups, before);
  const invalid = structuredClone(groups);
  invalid[1].items[24].question = "";
  assert.equal(checklistDraftError(invalid), "Grupo 2, Linha 25: Informe número inteiro positivo e pergunta.");
  assert.equal(groups[1].items[24].diagnosticRule, "BANK_ACCOUNT_SOURCE");
  assert.equal(groups.flatMap(group => group.items).length, 50);
});

test("resposta de erro da action mantém identidade e não altera o rascunho", async () => {
  const rows = [{ label: "Preservar", accountIds: ["a"] }];
  const response = { error: "Conflito documental", code: "CONFLICT" };
  assert.equal(await submitDraft(rows, () => null, async () => response), response);
  assert.deepEqual(rows, [{ label: "Preservar", accountIds: ["a"] }]);
});
