import assert from "node:assert/strict";
import { test } from "node:test";
import { diaryPayload, gradesPayload } from "./entry-drafts";

test("chamada envia também os alunos fora da página e mantém faltas", () => {
  const students = Array.from({ length: 41 }, (_, index) => ({ id: String(index) }));
  const payload = diaryPayload(students, { "0": false, "20": false, "40": false });
  assert.equal(payload.length, 41);
  assert.deepEqual(payload.filter((row) => !row.isPresent).map((row) => row.studentId), ["0", "20", "40"]);
});

test("notas preservam alunos não renderizados, feedback, zero e limpeza explícita", () => {
  const students = Array.from({ length: 21 }, (_, index) => ({ id: String(index) }));
  const old = { "20": { value: 8, concept: "Bom", absent: true, recoveryValue: 7, feedback: "Retorno integral" } };
  const untouched = gradesPayload(students, old, { "0": { value: "9" } });
  assert.equal(untouched.length, 21);
  assert.deepEqual(untouched[20], { studentId: "20", ...old["20"] });
  const cleared = gradesPayload(students, old, { "20": { value: "", recoveryValue: "", absent: false } });
  assert.equal(cleared[20].value, null);
  assert.equal(cleared[20].recoveryValue, null);
  assert.equal(cleared[20].absent, false);
  assert.equal(cleared[20].feedback, "Retorno integral");
  assert.equal(gradesPayload(students, old, { "20": { recoveryValue: "0" } })[20].recoveryValue, 0);
});

test("alunos sem nota fora da página continuam sem nota, e nota zero é preservada", () => {
  const students = Array.from({ length: 41 }, (_, index) => ({ id: String(index) }));
  const old = { "40": { value: null, concept: "Em avaliação", absent: false, recoveryValue: null, feedback: "Não lançar zero" } };
  const payload = gradesPayload(students, old, { "0": { value: "0" }, "20": { concept: "Bom" } });
  assert.equal(payload[0].value, 0);
  assert.equal(payload[20].value, null);
  assert.deepEqual(payload[40], { studentId: "40", ...old["40"] });
});
