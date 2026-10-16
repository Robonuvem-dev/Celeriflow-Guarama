import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { enforcementOpeningSchema, enforcementActSchema, enforcementAcknowledgementSchema, enforcementNextStatus, enforcementCaseWhere } from "../src/lib/obras/construction-enforcement-policy";

test("fiscalização sem alvará, notificação com prazo, levantamento e ciência exigem referências explícitas", () => {
  const opening = { requestKey: randomUUID(), realEstateId: "property", locationType: "RURAL", permitStatus: "WITHOUT_PERMIT", processTypeId: "type", subjectId: "subject", reason: "Obra rural sem documentação verificada" };
  assert.equal(enforcementOpeningSchema.safeParse(opening).success, true);
  assert.equal(enforcementOpeningSchema.safeParse({ ...opening, permitCaseId: "permit" }).success, false);
  const act = { caseId: "case", requestKey: randomUUID(), revision: 0, kind: "FISCAL_NOTICE", reason: "Adequar as condições constatadas", legalBasis: "Regra demonstrativa sem caráter oficial", issuedAt: "2026-10-01T12:00:00Z", deadlineAt: "2026-10-10T12:00:00Z", evidence: [] };
  assert.equal(enforcementActSchema.safeParse(act).success, true);
  assert.equal(enforcementActSchema.safeParse({ ...act, deadlineAt: "" }).success, false);
  assert.equal(enforcementActSchema.safeParse({ ...act, deadlineAt: "2026-09-01T12:00:00Z" }).success, false);
  assert.equal(enforcementActSchema.safeParse({ ...act, kind: "LIFT_EMBARGO" }).success, false);
  const ack = { caseId: "case", requestKey: randomUUID(), revision: 1, actId: "act", acknowledgedAt: "2026-10-02T12:00:00Z", method: "REFUSAL", recipient: "Destinatário demonstrativo", notes: "Recusa de recebimento certificada", evidence: [{ documentId: "doc", kind: "SERVICE_PROOF" }] };
  assert.equal(enforcementAcknowledgementSchema.safeParse(ack).success, true);
  assert.equal(enforcementAcknowledgementSchema.safeParse({ ...ack, evidence: [] }).success, false);
  assert.equal(enforcementAcknowledgementSchema.safeParse({ ...ack, evidence: [{ documentId: "doc", kind: "PHOTO" }] }).success, false);
});

test("setor/papel limitam consultas e embargo não é desfeito por outros atos", () => {
  const access = { administrator: false, employeeId: "fiscal", departmentId: "sector", roles: ["INSPECTOR"] };
  assert.deepEqual(enforcementCaseWhere(access), { process: { currentDepartmentId: "sector" } });
  assert.deepEqual(enforcementCaseWhere({ ...access, roles: ["ANALYST"] }), { id: { in: [] } });
  assert.deepEqual(enforcementCaseWhere({ ...access, departmentId: null }), { id: { in: [] } });
  assert.deepEqual(enforcementCaseWhere({ ...access, administrator: true }), {});
  assert.equal(enforcementNextStatus("OPEN", "EMBARGO"), "EMBARGOED");
  assert.equal(enforcementNextStatus("EMBARGOED", "INFRACTION"), "EMBARGOED");
  assert.equal(enforcementNextStatus("EMBARGOED", "LIFT_EMBARGO"), "OPEN");
  assert.throws(() => enforcementNextStatus("OPEN", "LIFT_EMBARGO"), /Não existe embargo/);
  assert.throws(() => enforcementNextStatus("EMBARGOED", "EMBARGO"), /Já existe embargo/);
});

test("PostgreSQL: fiscalização independente de alvará, FKs, numeração única e histórico imutável", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Process" (id TEXT PRIMARY KEY); CREATE TABLE "RealEstate" (id TEXT PRIMARY KEY); CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY); CREATE TABLE "Document" (id TEXT PRIMARY KEY);`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010250000_construction_enforcement/migration.sql", "utf8"));
    await db.exec(`
      INSERT INTO "Process" VALUES ('process'); INSERT INTO "RealEstate" VALUES ('property'); INSERT INTO "Document" VALUES ('doc');
      INSERT INTO "ConstructionEnforcementCase" (id,"requestKey","requestHash","processId","realEstateId","locationType","permitStatus",reason,"cadastralSnapshot","createdBy") VALUES ('case','open-key','hash','process','property','RURAL','WITHOUT_PERMIT','Constatação demonstrativa','{}','actor');
      INSERT INTO "ConstructionEnforcementAssignment" (id,"caseId","requestKey","requestHash","employeeId","departmentId","staffRoleId",reason,"createdBy") VALUES ('assignment','case','assignment-key','hash','fiscal','sector','role','Designação demonstrativa','actor');
      INSERT INTO "ConstructionEnforcementVisit" (id,"caseId","requestKey","requestHash","visitedAt",findings,"employeeId","departmentId","staffRoleId","createdBy") VALUES ('visit','case','visit-key','hash','2026-10-01','Obra sem alvará','fiscal','sector','role','actor');
      INSERT INTO "ConstructionEnforcementAct" (id,"caseId","requestKey","requestHash",number,kind,"visitId",reason,"legalBasis","issuedAt","employeeId","departmentId","staffRoleId","createdBy") VALUES ('embargo','case','embargo-key','hash','DEMO-FISC-2026-EMBARGO-000001','EMBARGO','visit','Constatação demonstrativa','Regra demonstrativa','2026-10-01','fiscal','sector','role','actor');
      INSERT INTO "ConstructionEnforcementAcknowledgement" (id,"actId","requestKey","requestHash","acknowledgedAt",method,recipient,notes,"createdBy") VALUES ('ack','embargo','ack-key','hash','2026-10-02','REFUSAL','Destinatário','Recusa certificada','actor');
      INSERT INTO "ConstructionEnforcementEvidence" (id,"documentId","acknowledgementId",kind,"versionSnapshot") VALUES ('evidence','doc','ack','SERVICE_PROOF','{"hashSha256":"test-hash"}');
      UPDATE "ConstructionEnforcementCase" SET status='EMBARGOED',revision=1,"assignedEmployeeId"='fiscal' WHERE id='case';
    `);
    assert.equal((await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "ConstructionEnforcementCase" WHERE "permitCaseId" IS NULL AND "permitStatus"='WITHOUT_PERMIT'`)).rows[0].count, 1);
    for (const table of ["ConstructionEnforcementAssignment", "ConstructionEnforcementVisit", "ConstructionEnforcementAct", "ConstructionEnforcementAcknowledgement", "ConstructionEnforcementEvidence"]) {
      await assert.rejects(db.exec(`UPDATE "${table}" SET "createdAt"=CURRENT_TIMESTAMP`), /imutavel/);
      await assert.rejects(db.exec(`DELETE FROM "${table}"`), /imutavel/);
    }
    await assert.rejects(db.exec(`UPDATE "ConstructionEnforcementCase" SET "permitStatus"='UNKNOWN'`), /imutavel/);
    await assert.rejects(db.exec(`DELETE FROM "Document" WHERE id='doc'`), /foreign key/);
    await assert.rejects(db.exec(`DELETE FROM "Process" WHERE id='process'`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionEnforcementEvidence" (id,"documentId","actId","visitId",kind,"versionSnapshot") VALUES ('ambiguous','doc','embargo','visit','PHOTO','{}')`), /check constraint/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionEnforcementAct" (id,"caseId","requestKey","requestHash",number,kind,reason,"legalBasis","issuedAt","employeeId","departmentId","staffRoleId","createdBy") SELECT 'duplicate',"caseId",'other-key',"requestHash",number,kind,reason,"legalBasis","issuedAt","employeeId","departmentId","staffRoleId","createdBy" FROM "ConstructionEnforcementAct" WHERE id='embargo'`), /unique constraint/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionEnforcementAct" (id,"caseId","requestKey","requestHash",number,kind,reason,"legalBasis","issuedAt","employeeId","departmentId","staffRoleId","createdBy") VALUES ('lifting','case','lift-key','hash','DEMO-FISC-LIFT','LIFT_EMBARGO','Motivo','Demonstrativo','2026-10-03','fiscal','sector','role','actor')`), /check constraint/);
  } finally { await db.close(); }
});
