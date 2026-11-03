import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLegalGovernmentLevel } from "../src/lib/cadastros/legal-text-policy";
test("esferas públicas ficam compatíveis com o filtro MUNICIPAL do portal sem alterar escopos legados", () => {
  assert.equal(normalizeLegalGovernmentLevel(" Municipal "), "MUNICIPAL");
  assert.equal(normalizeLegalGovernmentLevel("estadual"), "ESTADUAL");
  assert.equal(normalizeLegalGovernmentLevel("Federal"), "FEDERAL");
  assert.equal(normalizeLegalGovernmentLevel(" Consórcio regional "), "Consórcio regional");
});
