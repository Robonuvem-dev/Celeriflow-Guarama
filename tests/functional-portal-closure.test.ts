import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { recertificationDetailsSchema, validateRecertificationSections } from "../src/lib/rh/recertification-details";
import { evaluationResultRows, publishedEvaluationSchema } from "../src/lib/portal-servidor/evaluation-results";

test("additive portal migration preserves unresolved legacy requests and protects canonical bindings and candidate identity", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "HrPayrollRule"(id TEXT PRIMARY KEY,category TEXT,value JSONB);
      CREATE TABLE "PublicService"(id TEXT PRIMARY KEY,target TEXT);
      CREATE TABLE "BudgetUnit"(id TEXT PRIMARY KEY);
      CREATE TABLE "ProcessType"(id TEXT PRIMARY KEY);
      CREATE TABLE "Subject"(id TEXT PRIMARY KEY,"processTypeId" TEXT);
      CREATE TABLE "Employee"(id TEXT PRIMARY KEY,"personId" TEXT);
      CREATE TABLE "Usuario"(id TEXT PRIMARY KEY);
      CREATE TABLE "Process"(id TEXT PRIMARY KEY,"personId" TEXT);
      CREATE TABLE "HrPortalRequest"(id TEXT PRIMARY KEY,kind TEXT,"employeeId" TEXT,"actorId" TEXT,"decidedBy" TEXT,payload JSONB,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "PublicService" VALUES('public','Servidor');
      INSERT INTO "BudgetUnit" VALUES('ug'); INSERT INTO "ProcessType" VALUES('type'); INSERT INTO "Subject" VALUES('subject','type');
      INSERT INTO "Employee" VALUES('employee','person'); INSERT INTO "Usuario" VALUES('actor'),('candidate'),('candidate2');
      INSERT INTO "Process" VALUES('process','person'),('foreign','foreignperson');
      INSERT INTO "HrPayrollRule" VALUES('service','PORTAL','{"origin":"SERVICO_PORTAL_SERVIDOR","publicServiceId":"public","budgetUnitId":"ug","processTypeId":"type","subjectId":"subject","version":1,"operation":"SOLICITACAO_RH"}'),('notice','PORTAL','{}');
      INSERT INTO "HrPortalRequest"(id,kind,"employeeId","actorId",payload) VALUES
      ('valid','FUNCIONAL_SOLICITACAO_RH','employee','actor','{"origin":"REQUERIMENTO_FUNCIONAL","processId":"process","serviceId":"service","configuration":{"version":1}}'),
      ('legacy','ACESSO_PORTAL','missingemployee','missingactor','{}');
    `);
    await db.exec(readFileSync("prisma/migrations-ibema/20261012220000_functional_portal_bindings_recruitment/migration.sql", "utf8"));
    assert.equal((await db.query('SELECT * FROM "HrPortalRequest"')).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM "HrPortalRequestBinding"')).rows.length, 1);
    assert.equal((await db.query<{ portalPurpose: string }>('SELECT "portalPurpose" FROM "Process" WHERE id=\'process\'')).rows[0].portalPurpose, "INTERNO_ENTIDADE");
    const diagnostic = (await db.query<{ missingActor: boolean; missingEmployee: boolean }>('SELECT * FROM "HrPortalReferenceDiagnostics" WHERE "requestId"=\'legacy\'')).rows[0];
    assert.equal(diagnostic.missingActor, true); assert.equal(diagnostic.missingEmployee, true);
    await assert.rejects(db.exec('UPDATE "HrPortalRequestBinding" SET "employeeId"=\'other\' WHERE "requestId"=\'valid\''), /immutable/);
    await db.exec(`INSERT INTO "HrPortalRequest"(id,kind,"employeeId","actorId",payload) VALUES('bad','FUNCIONAL_SOLICITACAO_RH','employee','actor','{"origin":"REQUERIMENTO_FUNCIONAL","processId":"foreign","serviceId":"service","configuration":{"version":1}}')`);
    await assert.rejects(db.exec(`INSERT INTO "HrPortalRequestBinding"("requestId","processId","serviceRuleId","employeeId","actorId","serviceVersion") VALUES('bad','foreign','service','employee','actor',1)`), /conflicts/);
    await db.exec(`INSERT INTO "HrRecruitmentApplication"(id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,snapshot,"requestHash") VALUES('application','notice','candidate','52998224725','ROLE',1,'{}','hash')`);
    await assert.rejects(db.exec(`INSERT INTO "HrRecruitmentApplication"(id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,snapshot,"requestHash") VALUES('duplicate','notice','candidate2','52998224725','ROLE',2,'{}','hash')`), /unique/);
    await assert.rejects(db.exec(`UPDATE "HrRecruitmentApplication" SET cpf='11144477735' WHERE id='application'`), /immutable/);
    await assert.rejects(db.exec(`UPDATE "HrRecruitmentApplication" SET status='DEFERIDA' WHERE id='application'`), /requires/);
    await db.exec(`UPDATE "HrRecruitmentApplication" SET status='DEFERIDA',decision='Requisitos conferidos',"decidedById"='actor',"decidedAt"=now() WHERE id='application'`);
    await assert.rejects(db.exec(`UPDATE "HrRecruitmentApplication" SET decision='Outra decisão' WHERE id='application'`), /immutable/);
  } finally { await db.close(); }
});

test("recertification rejects unconfigured sections, repeated identities and inverted declared employment periods", () => {
  const details = recertificationDetailsSchema.parse({ dependents: [{ cpf: "529.982.247-25", name: "Dependente", birthDate: "2000-01-01", relationship: "Filho", irrfDependent: false, familyWage: false }] });
  assert.equal(details.dependents[0].cpf, "52998224725");
  assert.throws(() => validateRecertificationSections(details, []), /não habilitada/);
  assert.doesNotThrow(() => validateRecertificationSections(details, ["DEPENDENTES"]));
  assert.throws(() => validateRecertificationSections({ ...details, dependents: [details.dependents[0], details.dependents[0]] }, ["DEPENDENTES"]), /repetido/);
  assert.equal(recertificationDetailsSchema.safeParse({ previousEmployment: [{ employer: "Empregador", role: "Cargo", startsAt: "2020-02-01", endsAt: "2020-01-01", evidenceReference: "Documento 123" }] }).success, false);
});

test("published evaluation export exposes scores and authorized conclusion without clinical or commission-only comments", () => {
  const result = publishedEvaluationSchema.parse({ requestId: "request", employeeId: "employee", cycleName: "Ciclo", employeeName: "Servidor", conclusion: "Conclusão publicada", evidenceReference: "Ato 123", publisherId: "rh", publishedAt: "2026-10-12T00:00:00Z", releaseAt: "2026-10-12T00:00:00Z", policy: { origin: "AVALIACAO_FUNCIONAL", budgetUnitId: "ug", kind: "DESEMPENHO", employeeIds: ["employee"], commissionUserIds: ["commission"], startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z", instructions: "Instrumento", legalReference: "Norma municipal", questions: [{ code: "quality", label: "Qualidade", min: 0, max: 10, weight: 2 }] }, scores: [{ evaluatorId: "commission", score: "8.5", answers: { quality: 8.5 }, comment: "COMMISSION_ONLY" }] });
  const rows = evaluationResultRows(result);
  assert.ok(rows.some(row => row.includes("8.5000")));
  assert.ok(rows.some(row => row.includes("Conclusão publicada")));
  assert.ok(!JSON.stringify(rows).includes("COMMISSION_ONLY"));
});
