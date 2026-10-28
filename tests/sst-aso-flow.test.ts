import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertAsoProfessional, secondVacationWarning, asoCorrectionVersion } from "../src/lib/sst/aso-flow-policy";
import { prepareAsoFlow } from "../src/lib/sst/aso-flow-registration";
import { asoInput } from "../src/lib/sst/aso-policy";
import { createSstClinicalFixture } from "./helpers/sst-clinical-fixture";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { registerAso } from "../src/lib/sst/aso-service";
import { correctAso, readAsoFollowUp } from "../src/lib/sst/aso-flow-service";
import { asoDocumentOwners } from "../src/lib/sst/aso-flow-access";
import { loadEsocialSource } from "../src/lib/sst/esocial-source";

const day = new Date("2026-10-01");
const role = { id: "doctor-role", budgetUnitId: "ug", personId: "doctor", discipline: "MEDICINE", council: "CRM PR 1", startsAt: day, endsAt: day, isActive: true };
const expected = { budgetUnitId: "ug", personId: "doctor", discipline: "MEDICINE", council: "CRM PR 1", performedAt: day };
test("administrative habilitation checks UG, profession, council and inclusive civil validity", () => {
  assert.doesNotThrow(() => assertAsoProfessional(role, expected));
  for (const invalid of [undefined, { ...role, isActive: false }, { ...role, budgetUnitId: "other" }, { ...role, discipline: "NURSING" }, { ...role, council: "CRM PR 2" }, { ...role, endsAt: new Date("2026-09-30") }]) assert.throws(() => assertAsoProfessional(invalid, expected), /habilitação administrativa/);
});
test("second open acquisition period uses recorded RH deadline without adding a concession year", () => {
  const first = { id: "first", acquisitionStart: new Date("2023-01-01"), acquisitionEnd: new Date("2023-12-31"), expiresAt: new Date("2026-10-05") };
  const second = { id: "second", acquisitionStart: new Date("2024-01-01"), acquisitionEnd: new Date("2024-12-31"), expiresAt: new Date("2026-10-20") };
  assert.equal(secondVacationWarning([second, first], day, 20)?.id, "second");
  assert.equal(secondVacationWarning([first, second], day, 10), null);
  assert.equal(secondVacationWarning([first], day, 365), null);
  assert.notEqual(asoCorrectionVersion("hash", { id: "correction", requestHash: "revision" }), "hash");
});
test("pre-emission refuses specialized questionnaires, wrong answer types and absent explicit RH contract", async () => {
  const input = asoInput.parse({ budgetUnitId: "ug", personId: "worker", examinerPersonId: "doctor", examinerCouncil: "CRM PR 1", kind: "PERIODICO", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", programGroupId: "group", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", anamnesis: { questionnaireVersionId: "q", answers: { history: false, count: 0 } }, exams: [{ name: "Clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Normal", professionalPersonId: "doctor", professionalCouncil: "CRM PR 1" }] });
  const q = { id: "q", budgetUnitId: "ug", discipline: "MEDICINE", questions: [{ key: "history", label: "Histórico", kind: "BOOLEAN", required: true }, { key: "count", label: "Quantidade", kind: "NUMBER", required: true }] };
  const f = await createSstClinicalFixture();
  try {
    await f.database.query(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId",discipline,council,"startsAt","endsAt","createdById") VALUES ('doctor-role','ug','doctor','MEDICINE','CRM PR 1','2026-10-01','2026-10-01','user')`);
    await f.database.query(`INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById",discipline) VALUES ('q','ug','FLOW','Fluxo',1,$1,'flow','hash','user','MEDICINE'),('specialized','ug','PSY','Psicologia',1,$1,'psy','hash','user','PSYCHOLOGY')`, [JSON.stringify(q.questions)]);
    const prepare = (value: typeof input, employee?: string) => withDatabaseTransaction(f.connection, tx => prepareAsoFlow(tx, value, employee));
    const candidate = await prepare(input);
    assert.deepEqual(candidate.answers, { history: false, count: 0 }); assert.equal(candidate.functional, null);
    await assert.rejects(prepare({ ...input, functionalPeriodId: "period" }), /Candidato sem servidor/);
    await assert.rejects(prepare(input, "employee"), /vínculo funcional histórico/);
    await assert.rejects(prepare({ ...input, anamnesis: { ...input.anamnesis, answers: { history: "false", count: 0 } } }));
    await assert.rejects(prepare({ ...input, anamnesis: { ...input.anamnesis, questionnaireVersionId: "specialized" } }), /Medicina/);
  } finally { await f.close(); }
});
test("pre-emission returns the typed historical contract and snapshot for an employee", async () => {
  const input = asoInput.parse({ budgetUnitId: "ug", personId: "worker", functionalPeriodId: "period", examinerPersonId: "doctor", examinerCouncil: "CRM PR 1", kind: "PERIODICO", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", programGroupId: "group", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", anamnesis: { questionnaireVersionId: "q", answers: { history: false } }, exams: [{ name: "Clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Normal", professionalPersonId: "doctor", professionalCouncil: "CRM PR 1" }] });
  const f = await createSstClinicalFixture();
  try {
    const value = { ...input, examinerCouncil: "CRM PR 123", anamnesis: { ...input.anamnesis, questionnaireVersionId: "questionnaire" }, exams: input.exams.map(exam => ({ ...exam, professionalCouncil: "CRM PR 123" })) };
    const flow = await withDatabaseTransaction(f.connection, tx => prepareAsoFlow(tx, value, "employee"));
    assert.ok(flow.functional); assert.equal(flow.functional.id, "period");
    assert.equal(flow.functional.roleId, "historical-role"); assert.equal(flow.functional.departmentId, "department");
    assert.equal(flow.functional.governmentEntityId, "entity"); assert.deepEqual(flow.functional.snapshot, { registration: "001", role: "Cargo histórico", department: "Departamento histórico" });
    assert.equal(flow.functional.startsAt.toISOString(), "2026-01-01T00:00:00.000Z");
  } finally { await f.close(); }
});
test("additive workflow migration enforces atomic source, immutable correction and exam document ownership", async () => {
  const local = await createLocalDrizzleDatabase(), db = local.database;
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Document" (id TEXT PRIMARY KEY,"fileUrl" TEXT); CREATE TABLE "Vacation" (id TEXT PRIMARY KEY);
      CREATE TABLE "DocumentVersion" ("documentId" TEXT,"fileUrl" TEXT);
      CREATE TABLE "SstAso" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"personId" TEXT,"employeeId" TEXT,"examinerPersonId" TEXT,"examinerCouncil" TEXT,"performedAt" DATE,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "SstAnamnesis" (id TEXT PRIMARY KEY,"asoId" TEXT,"questionnaireVersionId" TEXT,revision INT);
      CREATE TABLE "SstProfessionalRole" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"personId" TEXT,discipline TEXT,council TEXT,"isActive" BOOLEAN,"startsAt" DATE,"endsAt" DATE);
      CREATE TABLE "SstQuestionnaireVersion" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,discipline TEXT);
      CREATE TABLE "SstOccupationalExam" (id TEXT PRIMARY KEY,"asoId" TEXT,"professionalPersonId" TEXT,"professionalCouncil" TEXT,"performedAt" DATE,kind TEXT,snapshot JSONB);
      CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,voided BOOLEAN,"supersedesId" TEXT);
      INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Document" VALUES ('doc','private:original'),('generic-alias','private:original'); INSERT INTO "DocumentVersion" VALUES ('doc','private:old-version');
      INSERT INTO "SstAso" VALUES ('legacy','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP);
      INSERT INTO "SstQuestionnaireVersion" VALUES ('q','ug','MEDICINE');
      INSERT INTO "SstProfessionalRole" VALUES ('role','ug','doctor','MEDICINE','CRM PR 1',true,'2026-01-01','2027-12-31');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011080000_complete_sst_aso_workflow/migration.sql", "utf8"));
    await assert.rejects(db.exec(`INSERT INTO "SstAso" VALUES ('invalid','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP)`), /transactional pre-emission/);
    await db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "SstAso" VALUES ('new','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP); INSERT INTO "SstAnamnesis" VALUES ('n','new','q',1); INSERT INTO "SstAsoFlowSource" VALUES ('new','n','role',NULL)`);
    });
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "SstAso" VALUES ('bad-profession','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP);
        INSERT INTO "SstAnamnesis" VALUES ('bad-n','bad-profession','q',1);
        INSERT INTO "SstOccupationalExam" VALUES ('bad-exam','bad-profession','doctor','CRM PR 1','2026-10-01','CLINICO','{"professionalDiscipline":"NURSING"}');
        INSERT INTO "SstAsoFlowSource" VALUES ('bad-profession','bad-n','role',NULL)`);
    }), /professional qualification/);
    await db.exec(`INSERT INTO "SstAsoCorrection" (id,"asoId",kind,reason,"requestHash","createdById") VALUES ('correction','new','ANNULMENT','Justificativa administrativa','hash','user')`);
    await assert.rejects(db.exec(`UPDATE "SstAsoCorrection" SET reason='Outra justificativa'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstAsoFlowSource"`), /immutable/);
    await db.exec(`INSERT INTO "SstOccupationalExam" (id,"asoId") VALUES ('exam','legacy')`);
    await assert.rejects(db.exec(`INSERT INTO "SstAsoDocument" (id,"asoId","examId","documentId",kind,"requestHash","createdById") VALUES ('link','new','exam','doc','ORIGIN','hash','user')`), /another ASO/);
    await db.exec(`INSERT INTO "SstAsoDocument" (id,"asoId","documentId",kind,"requestHash","createdById") VALUES ('generated','new','doc','GENERATED','hash','user')`);
    assert.deepEqual(await asoDocumentOwners(local.connection.db, "private:original"), [{ budgetUnitId: "ug" }]);
    assert.deepEqual(await asoDocumentOwners(local.connection.db, "private:old-version"), [{ budgetUnitId: "ug" }]);
    assert.deepEqual(await asoDocumentOwners(local.connection.db, "unrelated"), []);
    assert.equal((await db.query(`SELECT id FROM "SstAso" WHERE id='legacy'`)).rows.length, 1);
  } finally { await local.close(); }
});

async function workflowContext() {
  const local = await createSstClinicalFixture();
  const raw = { budgetUnitId: "ug", personId: "worker", functionalPeriodId: "period", programGroupId: "pg", examinerPersonId: "doctor", examinerCouncil: "CRM PR 123", kind: "PERIODICO", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", anamnesis: { questionnaireVersionId: "questionnaire", answers: { history: false } }, exams: [{ name: "Clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Normal", professionalPersonId: "doctor", professionalCouncil: "CRM PR 123" }] };
  const asoId = await registerAso(local.context, raw);
  const issue = (submissionKey: string) => registerAso(local.context, { ...raw, submissionKey });
  return { ...local, asoId, issue };
}
test("correction retry never mutates or duplicates issued origins, and clinical reader cannot correct", async () => {
  const f = await workflowContext();
  try {
    const raw = { asoId: f.asoId, kind: "ANNULMENT", reason: "Justificativa registrada", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
    await f.database.exec('UPDATE "SstAccessGrant" SET "canAssess"=false');
    await assert.rejects(correctAso(f.context, raw), /clínica/);
    assert.equal((await f.database.query('SELECT id FROM "SstAsoCorrection"')).rows.length, 0);
    await f.database.exec('UPDATE "SstAccessGrant" SET "canAssess"=true');
    assert.equal(await correctAso(f.context, raw), raw.submissionKey);
    assert.equal(await correctAso(f.context, raw), raw.submissionKey);
    assert.equal((await f.database.query('SELECT id FROM "SstAsoCorrection"')).rows.length, 1);
    await assert.rejects(correctAso(f.context, { ...raw, reason: "Justificativa alterada" }), /já corrigido/);
  } finally { await f.close(); }
});
test("follow-up checks UG clinical authorization before fetching records, slots, deadlines or GED links", async () => {
  const f = await workflowContext();
  try {
    f.context.user.allowedBudgetUnitIds = [];
    await f.database.exec('ALTER TABLE "SstAsoFlowSettings" RENAME TO "HiddenSettings"');
    await assert.rejects(readAsoFollowUp(f.context, f.asoId), /Unidade Gestora/);
  } finally { await f.close(); }
});
test("ASO correction changes eSocial source hash/version and preserves predecessor provenance on successor", async () => {
  const f = await workflowContext();
  try {
    const original = await loadEsocialSource(f.context, "S2220", f.asoId, "ug");
    await correctAso(f.context, { asoId: f.asoId, kind: "ANNULMENT", reason: "Anulação fundamentada", submissionKey: "3d161f17-63ca-4d57-9c87-82c4f74e4d5a" });
    const annulled = await loadEsocialSource(f.context, "S2220", f.asoId, "ug");
    assert.notEqual(original.sourceVersion, annulled.sourceVersion); assert.notEqual(original.sourceHash, annulled.sourceHash);
    assert.ok(annulled.missing.some(m => m.includes("ASO anulado")));
    const predecessorId = await f.issue("4d161f17-63ca-4d57-9c87-82c4f74e4d5a"), successorId = await f.issue("5d161f17-63ca-4d57-9c87-82c4f74e4d5a");
    const before = await loadEsocialSource(f.context, "S2220", successorId, "ug");
    await correctAso(f.context, { asoId: predecessorId, kind: "RECTIFICATION", replacementAsoId: successorId, reason: "Retificação fundamentada", submissionKey: "6d161f17-63ca-4d57-9c87-82c4f74e4d5a" });
    const successor = await loadEsocialSource(f.context, "S2220", successorId, "ug");
    assert.notEqual(before.sourceVersion, successor.sourceVersion); assert.notEqual(before.sourceHash, successor.sourceHash);
    assert.ok(successor.missing.some(m => m.includes(predecessorId)));
  } finally { await f.close(); }
});
