import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { asoInput, assertAsoProgram, formatSstCivilDate, sstCivilDate } from "../src/lib/sst/aso-policy";
import { registerAso } from "../src/lib/sst/aso-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createSstClinicalFixture } from "./helpers/sst-clinical-fixture";

const raw = {
  budgetUnitId: "ug", personId: "candidate", programGroupId: "pg", examinerPersonId: "doctor", examinerCouncil: "CRM PR 123",
  kind: "ADMISSIONAL", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", candidateReference: "Concurso 01/2026",
  submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a",
  anamnesis: { questionnaireVersionId: "questionnaire", answers: { history: false } },
  exams: [{ name: "Exame clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Avaliação clínica realizada", professionalPersonId: "doctor", professionalCouncil: "CRM PR 123" }],
};
const group = { code: "ADM", name: "Administrativo", departmentIds: [], roleIds: [], startsAt: "2026-01-01", endsAt: null };
const program = { budgetUnitId: "ug", kind: "PCMSO", startsAt: new Date("2026-01-01"), endsAt: new Date("2027-12-31"), code: "PCMSO", version: 2 };
const user: AppContext["user"] = {
  id: "user", firebaseUid: "user", email: "sst@example.invalid", name: "SST", role: "SST", profileCode: "SST_OPERATOR",
  modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: null, departmentId: null, secretariatId: null,
  permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true } } }),
};

test("ASO preserves civil dates and rejects rollover, expired exams and missing clinical examination", () => {
  assert.equal(sstCivilDate.safeParse("2026-02-31").success, false);
  assert.equal(formatSstCivilDate(sstCivilDate.parse("2026-10-01")), "01/10/2026");
  assert.equal(asoInput.safeParse(raw).success, true);
  assert.equal(asoInput.safeParse({ ...raw, exams: [{ ...raw.exams[0], kind: "COMPLEMENTAR" }] }).success, false);
  assert.equal(asoInput.safeParse({ ...raw, exams: [{ ...raw.exams[0], validUntil: "2026-09-30" }] }).success, false);
  assert.equal(asoInput.safeParse({ ...raw, exams: [{ ...raw.exams[0], professionalPersonId: "another" }] }).success, false);
  assert.equal(asoInput.safeParse({ ...raw, result: "APTO_RESTRICOES", recommendations: "" }).success, false);
  assert.equal(asoInput.safeParse({ ...raw, exams: [...raw.exams, { ...raw.exams[0], kind: "TOXICOLOGICO" }] }).success, false);
});

test("candidate without employee is accepted only for admission and a referenced selection process", () => {
  const input = asoInput.parse(raw);
  assert.doesNotThrow(() => assertAsoProgram(input, program, group, [], null, "secretariat"));
  assert.throws(() => assertAsoProgram({ ...input, kind: "PERIODICO" }, program, group, [], null, "secretariat"), /admissional/);
  assert.throws(() => assertAsoProgram({ ...input, candidateReference: "" }, program, group, [], null, "secretariat"), /processo seletivo/);
});

test("PCMSO scope, validity, exposure criteria and prescribed exams are enforced", () => {
  const input = asoInput.parse(raw);
  const employee = { isActive: true, secretariatId: "s", departmentId: "d", roleId: "r" };
  assert.throws(() => assertAsoProgram(input, { ...program, budgetUnitId: "other" }, group, [], employee, "s"), /mesma UG/);
  assert.throws(() => assertAsoProgram(input, { ...program, endsAt: new Date("2026-09-30") }, group, [], employee, "s"), /vigente/);
  assert.throws(() => assertAsoProgram(input, program, { ...group, roleIds: ["another"] }, [], employee, "s"), /critérios/);
  assert.throws(() => assertAsoProgram(input, program, group, [{ name: "Audiometria", occasion: "ADMISSIONAL" }], employee, "s"), /todos os exames/);
  assert.doesNotThrow(() => assertAsoProgram({ ...input, kind: "DEMISSIONAL" }, program, group, [], { ...employee, isActive: false }, "s"));
  assert.doesNotThrow(() => assertAsoProgram(input, { ...program, startsAt: new Date("2026-10-01T03:00:00Z") }, { ...group, startsAt: "2026-10-01T03:00:00Z" }, [], employee, "s"));
});

async function contextFixture(canAssess = true) {
  const local = await createSstClinicalFixture();
  local.context.user = { ...user };
  await local.database.query('UPDATE "SstAccessGrant" SET "canAssess"=$1', [canAssess]);
  const records = async () => (await local.database.query<{ employeeId: string | null; candidateReference: string; snapshot: { personName: string } }>('SELECT "employeeId","candidateReference",snapshot FROM "SstAso"')).rows;
  return { ...local, records };
}

test("ASO cannot be issued with module access alone, read-only clinical grants or another UG", async () => {
  const f = await contextFixture(false);
  try {
    await assert.rejects(registerAso(f.context, raw), /clínica/);
    await f.database.exec('UPDATE "SstAccessGrant" SET "canAssess"=true');
    await assert.rejects(registerAso(f.context, { ...raw, budgetUnitId: "other" }), /Unidade Gestora/);
    f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, create: false } } });
    await assert.rejects(registerAso(f.context, raw), /incluir ASO/);
    assert.equal((await f.records()).length, 0);
  } finally { await f.close(); }
});

test("ASO retry preserves the issued snapshot without creating an artificial employee or duplicate exams", async () => {
  const f = await contextFixture();
  try {
    const id = await registerAso(f.context, raw);
    assert.equal(await registerAso(f.context, raw), id);
    const writes = await f.records();
    assert.equal(writes.length, 1); assert.equal(writes[0].employeeId, null);
    assert.equal(writes[0].candidateReference, "Concurso 01/2026");
    assert.equal(writes[0].snapshot.personName, "Candidato");
    assert.equal((await f.database.query('SELECT id FROM "SstOccupationalExam"')).rows.length, 1);
    assert.equal((await f.database.query('SELECT id FROM "Employee"')).rows.length, 1);
    await assert.rejects(registerAso(f.context, { ...raw, result: "INAPTO" }), /outros dados/);
  } finally { await f.close(); }
});

test("additive ASO migration requires an atomic complete exam set and prevents later modifications", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY);
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY); CREATE TABLE "Company" (id TEXT PRIMARY KEY);
      CREATE TABLE "SstProgramExposureGroup" (id TEXT PRIMARY KEY);
      INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Person" VALUES ('candidate'), ('doctor');
      INSERT INTO "Employee" VALUES ('legacy'); INSERT INTO "SstProgramExposureGroup" VALUES ('pg');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010190000_add_sst_aso/migration.sql", "utf8"));
    const parent = `INSERT INTO "SstAso" (id,"budgetUnitId","personId","programGroupId","examinerPersonId","examinerCouncil",kind,result,"performedAt","validUntil",recommendations,"expectedExamCount",snapshot,"submissionKey","requestHash","createdById","candidateReference") VALUES ('aso','ug','candidate','pg','doctor','CRM PR 123','ADMISSIONAL','APTO','2026-10-01','2027-10-01','',1,'{}','key','hash','user','Concurso 2026');`;
    const child = (id: string) => `INSERT INTO "SstOccupationalExam" (id,"asoId",name,kind,source,"performedAt","validUntil",result,"professionalPersonId","professionalCouncil",snapshot) VALUES ('${id}','aso','Exame clínico','CLINICO','REALIZADO','2026-10-01','2027-10-01','Avaliação realizada','doctor','CRM PR 123','{}');`;
    await assert.rejects(db.exec(parent), /complete, valid/);
    assert.equal((await db.query('SELECT id FROM "SstAso"')).rows.length, 0);
    await db.transaction(async (tx) => { await tx.exec(parent); await tx.exec(child("exam")); });
    await assert.rejects(db.exec(`UPDATE "SstAso" SET result='INAPTO' WHERE id='aso'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstOccupationalExam" WHERE id='exam'`), /immutable/);
    await assert.rejects(db.exec(child("extra")), /complete, valid/);
    assert.deepEqual((await db.query('SELECT id FROM "SstOccupationalExam"')).rows, [{ id: "exam" }]);
    await assert.rejects(db.exec(`DELETE FROM "Person" WHERE id='candidate'`), /foreign key/);
    assert.deepEqual((await db.query('SELECT id FROM "Employee"')).rows, [{ id: "legacy" }]);
  } finally { await db.close(); }
});
