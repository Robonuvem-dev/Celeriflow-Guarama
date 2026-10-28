import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { questionnaireInput, questionnaireQuestions, validateQuestionnaireAnswers } from "../src/lib/sst/questionnaire-policy";
import { registerAnamnesis, registerQuestionnaireVersion } from "../src/lib/sst/questionnaire-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { sstTestContext } from "./helpers/sst-drizzle-context";

const key = "2d161f17-63ca-4d57-9c87-82c4f74e4d5a";
const questions = questionnaireQuestions.parse([
  { key: "queixa", label: "Queixa principal", kind: "TEXT", required: true },
  { key: "quantidade", label: "Quantidade", kind: "NUMBER", required: true },
  { key: "fumante", label: "Fumante", kind: "BOOLEAN", required: true },
  { key: "sintoma", label: "Sintoma", kind: "SINGLE_CHOICE", required: true, choices: ["Nenhum", "Dor"] },
  { key: "habitos", label: "Hábitos", kind: "MULTIPLE_CHOICE", required: false, choices: ["Caminhada", "Ciclismo"] },
  { key: "data", label: "Data de referência", kind: "DATE", required: false },
]);
const answers = { queixa: "Sem queixas", quantidade: 0, fumante: false, sintoma: "Nenhum", habitos: ["Ciclismo", "Caminhada"], data: "2026-10-01" };
const user: AppContext["user"] = { id: "user", firebaseUid: "user", name: "Médico usuário", email: "sst@example.invalid", role: "SST", profileCode: "SST_OPERATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: null, departmentId: null, secretariatId: null, permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true } } }) };

test("questionnaire definitions reject duplicate keys/options and inappropriate choice configuration", () => {
  assert.equal(questionnaireQuestions.safeParse([questions[0], questions[0]]).success, false);
  assert.equal(questionnaireQuestions.safeParse([{ ...questions[3], choices: ["Dor", "Dor"] }]).success, false);
  assert.equal(questionnaireQuestions.safeParse([{ ...questions[0], choices: ["Sim", "Não"] }]).success, false);
  assert.equal(questionnaireInput.safeParse({ budgetUnitId: "ug", code: "MED", title: "Anamnese", submissionKey: key, questions }).success, true);
});

test("answer validation preserves false and zero and rejects unknown questions, invalid options and impossible dates", () => {
  const parsed = validateQuestionnaireAnswers(questions, answers);
  assert.equal(parsed.quantidade, 0); assert.equal(parsed.fumante, false);
  assert.deepEqual(parsed.habitos, ["Caminhada", "Ciclismo"]);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, secret: "extra" }), /não pertencem/);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, sintoma: "Inventado" }), /Opção inválida/);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, habitos: ["Caminhada", "Caminhada"] }), /Opções inválidas/);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, fumante: "false" }));
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, quantidade: Infinity }));
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, queixa: "" }), /Responda/);
  assert.throws(() => validateQuestionnaireAnswers(questions, { ...answers, data: "2026-02-31" }));
  assert.equal(validateQuestionnaireAnswers(questionnaireQuestions.parse([{ key: "constructor", label: "Opcional", kind: "TEXT", required: false }]), {}).constructor, null);
});

async function fixture(grant = { isActive: true, canReadClinical: true, canAssess: true }) {
  const local = await createLocalDrizzleDatabase(), db = local.database;
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); INSERT INTO "BudgetUnit" VALUES ('ug'),('other');
    CREATE TABLE "SstAso" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"examinerCouncil" TEXT,snapshot JSONB);
    CREATE TABLE "SstAccessGrant" (id TEXT PRIMARY KEY,"usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now());
    CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY,"actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP DEFAULT now());`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010210000_add_sst_questionnaires/migration.sql", "utf8"));
    await db.exec(`ALTER TABLE "SstQuestionnaireVersion" ADD discipline TEXT NOT NULL DEFAULT 'MEDICINE'`);
    await db.query(`INSERT INTO "SstAccessGrant" (id,"usuarioId","budgetUnitId","isActive","canReadClinical","canAssess") VALUES ('grant','user','ug',$1,$2,$3)`, [grant.isActive, grant.canReadClinical, grant.canAssess]);
    await db.query(`INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById") VALUES ('q','ug','MED','Anamnese',3,$1,'seed','hash','user')`, [JSON.stringify(questions)]);
    await db.query(`INSERT INTO "SstAso" VALUES ('aso','ug','CRM PR 123',$1)`, [JSON.stringify({ personName: "Pessoa", cpf: "00000000000", registration: null, role: null, department: null, unitName: "UG", examinerName: "Médico", programCode: "PCMSO", programVersion: 1, group: { code: "G", name: "Grupo", departmentIds: [], roleIds: [], startsAt: "2026-01-01", endsAt: null }, prescribedExams: [] })]);
    const context = sstTestContext(local.connection.db, { ...user });
    const responses = async () => (await db.query<{ revision: number; snapshot: { title: string } }>('SELECT revision,snapshot FROM "SstAnamnesis" ORDER BY revision')).rows;
    return { context, db, responses, close: local.close };
  } catch (error) { await local.close(); throw error; }
}
const input = { asoId: "aso", questionnaireVersionId: "q", answers, submissionKey: key };

test("anamnesis requires clinical assessment authorization and enforces ASO/questionnaire unit scope", async () => {
  const reader = await fixture({ isActive: true, canReadClinical: true, canAssess: false });
  try {
    await assert.rejects(registerAnamnesis(reader.context, input), /clínica/);
    assert.equal((await reader.responses()).length, 0);
  } finally { await reader.close(); }
  const other = await fixture();
  try {
    await other.db.query(`INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById") VALUES ('other-q','other','MED','Outra UG',1,$1,'other','hash','user')`, [JSON.stringify(questions)]);
    await assert.rejects(registerAnamnesis(other.context, { ...input, questionnaireVersionId: "other-q" }), /UG do ASO/);
    assert.equal((await other.responses()).length, 0);
    other.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, create: false } } });
    await assert.rejects(registerAnamnesis(other.context, input), /incluir registros/);
  } finally { await other.close(); }
});

test("anamnesis retries preserve snapshots and revisions require a reason without overwriting existing answers", async () => {
  const f = await fixture();
  try {
    const id = await registerAnamnesis(f.context, input);
    assert.equal(await registerAnamnesis(f.context, input), id);
    assert.equal((await f.responses()).length, 1);
    await assert.rejects(registerAnamnesis(f.context, { ...input, answers: { ...answers, queixa: "Dor" } }), /outros dados/);
    const next = { ...input, submissionKey: "4d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
    await assert.rejects(registerAnamnesis(f.context, next), /Justifique/);
    const nextQuestionnaire = await registerQuestionnaireVersion(f.context, { budgetUnitId: "ug", code: "MED", title: "Título da versão seguinte", questions, submissionKey: next.submissionKey });
    await registerAnamnesis(f.context, { ...next, questionnaireVersionId: nextQuestionnaire, revisionReason: "Complementação após conferência médica" });
    const responses = await f.responses();
    assert.deepEqual(responses.map(row => [row.revision, row.snapshot.title]), [[1, "Anamnese"], [2, "Título da versão seguinte"]]);
  } finally { await f.close(); }
});

test("questionnaire registration allocates a new version under locks and retries do not duplicate it", async () => {
  const f = await fixture();
  try {
    const raw = { budgetUnitId: "ug", code: "MED", title: "Anamnese", questions, submissionKey: key };
    const id = await registerQuestionnaireVersion(f.context, raw);
    assert.equal(await registerQuestionnaireVersion(f.context, raw), id);
    assert.deepEqual((await f.db.query('SELECT version FROM "SstQuestionnaireVersion" ORDER BY version')).rows, [{ version: 3 }, { version: 4 }]);
    assert.equal((await f.db.query('SELECT id FROM "AuditEvent"')).rows.length, 1);
  } finally { await f.close(); }
});

test("migration preserves versions and responses, enforces cross-unit scope and protects canonical ASO", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "SstAso" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT);
      INSERT INTO "BudgetUnit" VALUES ('ug'),('other'); INSERT INTO "SstAso" VALUES ('aso','ug');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010210000_add_sst_questionnaires/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById") VALUES
      ('q1','ug','MED','Anamnese',1,'[{"key":"queixa"}]','key1','hash','user'),
      ('q2','ug','MED','Anamnese nova',2,'[{"key":"nova"}]','key2','hash','user'),
      ('other-q','other','MED','Outra UG',1,'[{"key":"queixa"}]','key3','hash','user');`);
    const insert = (id: string, q: string, revision: number, reason = "") => `INSERT INTO "SstAnamnesis" (id,"asoId","questionnaireVersionId",revision,answers,snapshot,"revisionReason","submissionKey","requestHash","createdById") VALUES ('${id}','aso','${q}',${revision},'{"queixa":"Sem queixas"}','{}','${reason}','${id}','hash','user')`;
    await db.exec(insert("a1", "q1", 1));
    await assert.rejects(db.exec(insert("cross", "other-q", 2, "Complementação médica")), /same budget unit/);
    await assert.rejects(db.exec(insert("a2", "q2", 2)), /check constraint/);
    await db.exec(insert("a2", "q2", 2, "Complementação médica"));
    await assert.rejects(db.exec(`UPDATE "SstQuestionnaireVersion" SET title='Modificado' WHERE id='q1'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstAnamnesis" WHERE id='a1'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstAso" WHERE id='aso'`), /foreign key/);
    assert.deepEqual((await db.query('SELECT revision FROM "SstAnamnesis" ORDER BY revision')).rows, [{ revision: 1 }, { revision: 2 }]);
  } finally { await db.close(); }
});
