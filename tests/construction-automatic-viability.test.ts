import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAutomaticConstructionViability, automaticViabilityInputSchema } from "../src/lib/obras/construction-automatic-viability-policy";

const rule = { id: "zone-v2", version: 2, publishedBy: "publisher", code: "Z1", name: "Zona demonstrativa", legalBasis: "Parâmetros DEMO, sem homologação de legislação oficial", startsAt: "2026-01-01", endsAt: "", allowedPurposeIds: ["residential"], allowedCategories: ["BUILDING" as const], minimumLandArea: "200", maxFloorAreaRatio: "0.5", automatic: true };
const definition = { id: "definition", version: 1, publishedBy: "CONSTRUCTION_DEMO_SEED", definition: { fields: [], checks: [{ key: "territory", label: "Zoneamento e índices conferidos (DEMONSTRAÇÃO)", required: true }], documents: [] } };
const input = { category: "BUILDING", locationType: "URBAN", purposeId: "residential", purposeActive: true, catalogSnapshot: { purpose: { id: "residential", label: "Residencial" }, material: { label: "Alvenaria" } }, proposedArea: "150.0000", today: "2026-10-10", properties: [{ realEstateId: "authorized-property", landArea: "300", cadastralSnapshot: { municipalInsc: "1" }, rule }], viabilityDefinitionSnapshot: definition };
test("consulta determinística preserva finalidade, território, vigência, publicação e escopo limitado demonstrativo", () => {
  const first = evaluateAutomaticConstructionViability(input);
  assert.deepEqual(first, evaluateAutomaticConstructionViability(input));
  assert.equal(first.outcome, "APPROVED"); assert.equal(first.evaluations[0].limit, "150.0000");
  assert.equal(first.evaluations[0].legalBasis, rule.legalBasis);
  assert.equal((first.evaluations[0].rule as typeof rule).version, 2);
  assert.deepEqual(first.catalogSnapshot, input.catalogSnapshot);
  assert.equal(first.demonstration, true); assert.match(first.disclaimer, /não constitui aprovação integral/);
  assert.equal(first.checklistEvidence[0].status, "COMPUTED");
  assert.deepEqual(first.viabilityDefinitionSnapshot, definition);
});
test("áreas decimais exatas e finalidade incompatível geram decisão negativa sem revisão manual", () => {
  assert.equal(evaluateAutomaticConstructionViability({ ...input, proposedArea: "150.0001" }).outcome, "DENIED");
  assert.equal(evaluateAutomaticConstructionViability({ ...input, purposeId: "industrial" }).outcome, "DENIED");
  assert.equal(evaluateAutomaticConstructionViability({ ...input, properties: [{ ...input.properties[0], landArea: "199.9999" }] }).outcome, "DENIED");
});
test("sem regra, finalidade vigente, terreno ou repartição territorial nunca aprova por ausência de avaliações", () => {
  for (const change of [{ properties: [] }, { purposeActive: false }, { purposeId: null }, { properties: [{ ...input.properties[0], rule: null }] }, { properties: [...input.properties, { ...input.properties[0], realEstateId: "second" }] }, { properties: [{ ...input.properties[0], landArea: "0" }] }, { properties: [{ ...input.properties[0], rule: { ...rule, automatic: false } }] }, { properties: [{ ...input.properties[0], rule: { ...rule, endsAt: "2026-10-09" } }] }]) {
    assert.equal(evaluateAutomaticConstructionViability({ ...input, ...change }).outcome, "MANUAL");
  }
});
test("API não aceita indicadores, regras nem referência arbitrária de imóvel fornecidos pelo cliente", () => {
  assert.equal(automaticViabilityInputSchema.safeParse({ caseId: "case", requestKey: "f6d89ccc-6855-49f0-b91b-2432b472f35a", propertyId: "someone-else", proposedArea: "0" }).success, false);
});
test("publicação VIABILITY e critérios obrigatórios são respeitados: requisito não computável bloqueia para humano", () => {
  assert.equal(evaluateAutomaticConstructionViability({ ...input, viabilityDefinitionSnapshot: null }).outcome, "MANUAL");
  for (const change of [
    { checks: [...definition.definition.checks, { key: "environment", label: "Licença ambiental", required: true }] },
    { fields: [{ key: "height", label: "Altura", type: "NUMBER", required: true, options: [] }] },
    { documents: [{ label: "Licença ambiental assinada", required: true }] },
  ]) {
    const result = evaluateAutomaticConstructionViability({ ...input, viabilityDefinitionSnapshot: { ...definition, definition: { ...definition.definition, ...change } } });
    assert.equal(result.outcome, "MANUAL"); assert.ok(result.reasons.some((r) => /humana/.test(r)));
  }
});
