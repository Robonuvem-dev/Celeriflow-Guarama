import assert from "node:assert/strict";
import { test } from "node:test";
import { benefitRequestItemsError, benefitRequestItemsPayload, updateBenefitRequestItem, type BenefitRequestItemDraft } from "./benefit-item-drafts";

const draft = (): BenefitRequestItemDraft[] => Array.from({ length: 30 }, (_, index) => ({ draftId: `row-${index}`, benefitId: `benefit-${index}`, quantity: index + 1, value: "" }));
const benefits = Array.from({ length: 30 }, (_, index) => ({ id: `benefit-${index}`, name: `Benefício ${index}`, dispensingMode: index === 29 ? "VALUE" : "QUANTITY" }));

test("edição filtrada na página 2 mantém todos os benefícios e serializa o mesmo array integral do formulário", () => {
  const original = draft();
  const filtered = original.filter((item) => item.draftId === "row-29");
  const edited = updateBenefitRequestItem(original, filtered[0].draftId, { quantity: 3, value: "123.45" });
  const payload = benefitRequestItemsPayload(edited);
  const form = new FormData();
  form.set("items", JSON.stringify(payload));
  const submitted = JSON.parse(String(form.get("items")));
  assert.equal(submitted.length, 30);
  assert.deepEqual(submitted[0], { benefitId: "benefit-0", quantity: 1, value: "" });
  assert.deepEqual(submitted[29], { benefitId: "benefit-29", quantity: 3, value: "123.45" });
  assert.ok(!("draftId" in submitted[29]));
  assert.equal(original[29].value, "");
  assert.equal(benefitRequestItemsError(edited, benefits), null);
});

test("remoção anterior não desloca a identidade editada nem altera os demais rascunhos", () => {
  const original = draft();
  const remaining = original.filter((item) => item.draftId !== "row-0");
  const edited = updateBenefitRequestItem(remaining, "row-21", { quantity: 77 });
  assert.equal(edited.length, 29);
  assert.equal(edited.find((item) => item.draftId === "row-21")?.quantity, 77);
  assert.deepEqual(edited.find((item) => item.draftId === "row-22"), original[22]);
});

test("validação cobre itens fora da página e exige valor financeiro sem apagar o rascunho inválido", () => {
  const items = draft();
  assert.match(benefitRequestItemsError(items, benefits) || "", /Item 30.*valor financeiro/);
  const corrected = updateBenefitRequestItem(items, "row-29", { value: "1.00" });
  const invalid = updateBenefitRequestItem(corrected, "row-25", { quantity: 0 });
  assert.match(benefitRequestItemsError(invalid, benefits) || "", /Item 26.*quantidade/);
  assert.equal(invalid[25].quantity, 0);
  assert.equal(benefitRequestItemsPayload(invalid).length, 30);
});
