import assert from "node:assert/strict";
import test from "node:test";
import { intervalsOverlap, makeSupportCode, parseEducacensoFile, validateEducacensoRows, validateScheduleInterval } from "../src/lib/educacao/s1.ts";

test("interpreta registros do arquivo de intercâmbio educacional", () => {
  const rows = parseEducacensoFile("ESCOLA;41000123;Escola Central\nESTUDANTE;A-10;Ana Silva");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { line: 1, type: "ESCOLA", fields: ["41000123", "Escola Central"] });
  assert.deepEqual(validateEducacensoRows(rows), []);
});

test("aponta linha e tipo incompatível sem aceitar silenciosamente", () => {
  const issues = validateEducacensoRows(parseEducacensoFile("OUTRO;1;Nome\nTURMA;T1"));
  assert.deepEqual(issues.map((item) => item.line), [1, 2]);
});

test("valida intervalos e conflitos de horário", () => {
  assert.equal(validateScheduleInterval("08:00", "08:50"), true);
  assert.equal(validateScheduleInterval("09:00", "08:50"), false);
  assert.equal(intervalsOverlap("08:00", "08:50", "08:40", "09:30"), true);
  assert.equal(intervalsOverlap("08:00", "08:50", "08:50", "09:30"), false);
});

test("gera código de matrícula determinístico", () => {
  assert.equal(makeSupportCode(2026, "ALU-0001"), "MAT-2026-ALU0001");
});

test("diário preserva datas anteriores e bloqueia dias sucessores ao falecimento ou abandono", async () => {
  const { canRecordAttendance, consecutiveAbsentDays } = await import("../src/lib/educacao/enrollment-lifecycle");
  const student = {enrollmentDate:"2026-02-01",endDate:"2026-05-10"};
  assert.equal(canRecordAttendance(student,"2026-05-10"),true);
  assert.equal(canRecordAttendance(student,"2026-05-11"),false);
  assert.equal(canRecordAttendance(student,"2026-01-31"),false);
  assert.equal(consecutiveAbsentDays([{date:"2026-05-01",isPresent:true},{date:"2026-05-02",isPresent:false},{date:"2026-05-03",isPresent:false}]),2);
  assert.equal(consecutiveAbsentDays([{date:"2026-05-02",isPresent:false},{date:"2026-05-03",isPresent:null}]),0);
});
