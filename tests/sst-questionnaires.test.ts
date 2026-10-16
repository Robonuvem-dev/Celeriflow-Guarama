import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { questionnaireInput, questionnaireQuestions, validateQuestionnaireAnswers } from "../src/lib/sst/questionnaire-policy";
import { registerAnamnesis, registerQuestionnaireVersion } from "../src/lib/sst/questionnaire-service";
import type { AppContext } from "../src/lib/platform/tenant-context";

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

function fixture(grant = { isActive: true, canReadClinical: true, canAssess: true }) {
  const records: { id: string; requestHash: string; createdById: string; revision: number }[] = [];
  const writes: Record<string, unknown>[] = [];
  const questionnaire = { id: "q", budgetUnitId: "ug", code: "MED", title: "Anamnese", version: 2, questions };
  const tx = {
    $executeRaw: async () => 1,
    sstQuestionnaireVersion: { findUnique: async () => questionnaire },
    sstAnamnesis: {
      findUnique: async ({ where }: { where: { asoId_submissionKey: { submissionKey: string } } }) => where.asoId_submissionKey.submissionKey === key ? records[0] || null : null,
      findFirst: async () => records.at(-1) || null,
      create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); const record = { id: `answer-${writes.length}`, requestHash: String(data.requestHash), createdById: String(data.createdById), revision: Number(data.revision) }; records.push(record); return record; },
    },
    sstAso: { findUniqueOrThrow: async () => ({ examinerCouncil: "CRM PR 123", snapshot: { personName: "Pessoa", cpf: "00000000000", registration: null, role: null, department: null, unitName: "UG", examinerName: "Médico", programCode: "PCMSO", programVersion: 1, group: { code: "G", name: "Grupo", departmentIds: [], roleIds: [], startsAt: "2026-01-01", endsAt: null }, prescribedExams: [] } }) },
    auditEvent: { create: async () => ({}) },
  };
  const context = { user: { ...user }, prisma: { sstAso: { findUnique: async () => ({ budgetUnitId: "ug" }) }, sstAccessGrant: { findUnique: async () => grant }, $transaction: async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx) } } as unknown as AppContext;
  return { context, writes, questionnaire };
}
const input = { asoId: "aso", questionnaireVersionId: "q", answers, submissionKey: key };

test("anamnesis requires clinical assessment authorization and enforces ASO/questionnaire unit scope", async () => {
  const reader = fixture({ isActive: true, canReadClinical: true, canAssess: false });
  await assert.rejects(registerAnamnesis(reader.context, input), /clínica/);
  assert.equal(reader.writes.length, 0);
  const other = fixture(); other.questionnaire.budgetUnitId = "other";
  await assert.rejects(registerAnamnesis(other.context, input), /UG do ASO/);
  assert.equal(other.writes.length, 0);
  other.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, create: false } } });
  await assert.rejects(registerAnamnesis(other.context, input), /incluir registros/);
});

test("anamnesis retries preserve snapshots and revisions require a reason without overwriting existing answers", async () => {
  const { context, writes, questionnaire } = fixture();
  assert.equal(await registerAnamnesis(context, input), "answer-1");
  assert.equal(await registerAnamnesis(context, input), "answer-1");
  assert.equal(writes.length, 1);
  await assert.rejects(registerAnamnesis(context, { ...input, answers: { ...answers, queixa: "Dor" } }), /outros dados/);
  const next = { ...input, submissionKey: "4d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
  await assert.rejects(registerAnamnesis(context, next), /Justifique/);
  questionnaire.title = "Título da versão seguinte";
  await registerAnamnesis(context, { ...next, revisionReason: "Complementação após conferência médica" });
  assert.equal(writes[0].revision, 1); assert.equal(writes[1].revision, 2);
  assert.equal((writes[0].snapshot as { title: string }).title, "Anamnese");
  assert.equal((writes[1].snapshot as { title: string }).title, "Título da versão seguinte");
});

test("questionnaire registration allocates a new version under locks and retries do not duplicate it", async () => {
  let existing: { id: string; createdById: string; requestHash: string } | null = null;
  let locks = 0; let writes = 0;
  const tx = { $executeRaw: async () => { locks++; }, sstQuestionnaireVersion: { findUnique: async () => existing, findFirst: async () => ({ version: 3 }), create: async ({ data }: { data: { version: number; createdById: string; requestHash: string } }) => { assert.equal(data.version, 4); writes++; existing = { id: "q4", createdById: data.createdById, requestHash: data.requestHash }; return existing; } }, auditEvent: { create: async () => ({}) } };
  const context = { user, prisma: { sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess: true }) }, $transaction: async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx) } } as unknown as AppContext;
  const raw = { budgetUnitId: "ug", code: "MED", title: "Anamnese", questions, submissionKey: key };
  assert.equal(await registerQuestionnaireVersion(context, raw), "q4");
  assert.equal(await registerQuestionnaireVersion(context, raw), "q4");
  assert.equal(writes, 1); assert.equal(locks, 3);
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
