import assert from "node:assert/strict";
import test from "node:test";
import { parallelDraftEntries, programDraftEntries, selectionDraftEntries } from "./draft-payload";
import { questionnaireQuestions, validateQuestionnaireAnswers } from "@/lib/sst/questionnaire-policy";

test("ordem de serviço mantém alinhamento do material/quantidade/exigência com posições vazias", () => {
  const rows = [{ materialId: "epi-a", quantity: "2", requirement: "Uso externo" }, { materialId: "", quantity: "1", requirement: "" }, { materialId: "epi-b", quantity: "0.001", requirement: "Proteção específica" }, { materialId: "", quantity: "1", requirement: "" }, { materialId: "epc-c", quantity: "3", requirement: "Instalação coletiva" }];
  const form = new FormData();
  for (const [name, value] of parallelDraftEntries(rows, ["materialId", "quantity", "requirement"])) form.append(name, value);
  const projected = form.getAll("materialId").map(String).map((materialId, i) => ({ materialId, quantity: form.getAll("quantity")[i], requirement: form.getAll("requirement")[i] })).filter(item => item.materialId);
  assert.deepEqual(projected, [rows[0], rows[2], rows[4]]);
  assert.equal(form.getAll("materialId").length, 5);
});

test("junta envia todas as posições paralelas e a seleção envia IDs de páginas distintas", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ personId: i === 4 ? "" : `person-${i}`, council: i === 4 ? "" : `CRM ${i}` }));
  const form = new FormData();
  for (const [name, value] of parallelDraftEntries(rows, ["personId", "council"])) form.append(name, value);
  assert.deepEqual(form.getAll("personId").map(String).flatMap((personId, i) => personId ? [{ personId, council: form.getAll("council")[i] }] : []), rows.filter(row => row.personId));
  const selected = Array.from({ length: 41 }, (_, i) => `group-${i}`);
  for (const [name, id] of selectionDraftEntries("groupId", selected)) form.append(name, id);
  assert.deepEqual(form.getAll("groupId"), selected);
  assert.equal(form.getAll("groupId")[40], "group-40");
  const checkboxOrder = selectionDraftEntries("groupId", [...selected].reverse(), selected).map(([, id]) => id);
  assert.deepEqual(checkboxOrder, selected, "getAll deve manter a ordem original dos checkboxes, não a ordem dos cliques");
});

test("respostas em outras páginas são obrigatórias e preservam falso, zero e múltiplas opções", () => {
  const questions = questionnaireQuestions.parse(Array.from({ length: 23 }, (_, i) => ({ key: `q_${i}`, label: `Pergunta ${i}`, kind: i === 20 ? "BOOLEAN" : i === 21 ? "NUMBER" : i === 22 ? "MULTIPLE_CHOICE" : "TEXT", required: true, choices: i === 22 ? ["Primeira", "Segunda"] : [] })));
  const answers = Object.fromEntries(questions.map((question, i) => [question.key, i === 20 ? false : i === 21 ? 0 : i === 22 ? ["Segunda", "Primeira"] : "Respondida"]));
  const validated = validateQuestionnaireAnswers(questions, answers);
  assert.equal(validated.q_20, false); assert.equal(validated.q_21, 0); assert.deepEqual(validated.q_22, ["Primeira", "Segunda"]);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, q_22: [] }), /Pergunta 22/);
});

test("programa mantém semântica de checkbox, texto e filtros por GHE/tipo no payload", () => {
  const draft = { "g1.conditions": "Oficina", "g1.risk.0.epiApplicable": true, "g1.risk.1.epiApplicable": false, "g1.risk.0.description": "false", "g1.risk.0.exposureMinutes": "0", "g1.exam.PERIODICO": "Audiometria", "g2.conditions": "Outro GHE" };
  assert.deepEqual(Object.fromEntries(programDraftEntries(draft, ["g1"], "PGR")), { "g1.conditions": "Oficina", "g1.risk.0.epiApplicable": "on", "g1.risk.0.description": "false", "g1.risk.0.exposureMinutes": "0" });
  assert.deepEqual(Object.fromEntries(programDraftEntries(draft, ["g1"], "PCMSO")), { "g1.exam.PERIODICO": "Audiometria" });
  assert.deepEqual(programDraftEntries(draft, [], "LTCAT"), []);
});
