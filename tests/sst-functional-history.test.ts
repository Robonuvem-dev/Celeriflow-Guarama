import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { functionalPeriodInput, historicalIntersection, matchesHistoricalExposure, type FunctionalScope } from "../src/lib/sst/functional-policy";
import { serviceOrderInput } from "../src/lib/sst/service-order-policy";

const period = { submissionKey: "00000000-0000-4000-8000-000000000001", employeeId: "e", budgetUnitId: "ug", governmentEntityId: "entity", employmentRegimeId: "regime", roleId: "cargo", functionRoleId: "funcao", departmentId: "d", localId: "l", costCenterId: "c", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z", contractReference: "Contrato 10/2026", sourceReference: "Ato oficial de lotação 123" };
test("functional history distinguishes cargo/function and half-open historical intersections", () => {
  const input = functionalPeriodInput.parse(period);
  const scope = { ...input, id: "p", functionRoleId: "funcao", snapshot: {} } satisfies FunctionalScope;
  assert.equal(matchesHistoricalExposure(scope, { departmentIds: ["d"], roleIds: ["cargo"] }), true);
  assert.equal(matchesHistoricalExposure(scope, { departmentIds: ["d"], roleIds: ["funcao"] }), false);
  assert.equal(historicalIntersection(scope, { startsAt: input.endsAt, endsAt: new Date("2026-12-01") }), null);
  assert.equal(functionalPeriodInput.safeParse({ ...period, voided: true }).success, false);
  assert.equal(functionalPeriodInput.safeParse({ ...period, endsAt: period.startsAt }).success, false);
});
test("service orders require explicit individual history and canonical unique material identities", () => {
  const order = { submissionKey: period.submissionKey, budgetUnitId: "ug", programGroupId: "pg", responsibilityId: "resp", startsAt: period.startsAt, endsAt: period.endsAt, prevention: "Prevenir ruído ocupacional", standards: "Normas NR-6", accidentConduct: "Procurar primeiros socorros" };
  assert.equal(serviceOrderInput.safeParse(order).success, true);
  assert.equal(serviceOrderInput.safeParse({ ...order, employeeId: "e" }).success, false);
  assert.equal(serviceOrderInput.safeParse({ ...order, employeeId: "e", functionalPeriodId: "p" }).success, true);
  const item = { materialId: "canonical", quantity: 1, requirement: "Uso obrigatório" };
  assert.equal(serviceOrderInput.safeParse({ ...order, equipmentRequirements: [item, item] }).success, false);
});

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY,"secretariatId" TEXT);
    CREATE TABLE "GovernmentEntity" (id TEXT PRIMARY KEY);
    CREATE TABLE "Employee" (id TEXT PRIMARY KEY);
    CREATE TABLE "HrEmploymentRegime" (id TEXT PRIMARY KEY);
    CREATE TABLE "Role" (id TEXT PRIMARY KEY);
    CREATE TABLE "Department" (id TEXT PRIMARY KEY,"secretariatId" TEXT);
    CREATE TABLE "AdministrativeUnit" (id TEXT PRIMARY KEY,"secretariatId" TEXT);
    CREATE TABLE "CostCenter" (id TEXT PRIMARY KEY,"governmentEntityId" TEXT,"secretariatId" TEXT,"departmentId" TEXT,"administrativeUnitId" TEXT);
    CREATE TABLE "Person" (id TEXT PRIMARY KEY);
    CREATE TABLE "SstExposureGroup" (id TEXT PRIMARY KEY);
    CREATE TABLE "SstOccupationalProgram" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,kind TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
    CREATE TABLE "SstProgramExposureGroup" (id TEXT PRIMARY KEY,"programId" TEXT,"groupId" TEXT,"groupSnapshot" JSONB);
    CREATE TABLE "Material" (id TEXT PRIMARY KEY,"isActive" BOOLEAN);
    CREATE TABLE "SstCertificateReason" (id TEXT PRIMARY KEY);
    CREATE TABLE "Leave" (id TEXT PRIMARY KEY,status TEXT,"updatedAt" TIMESTAMP,"employeeId" TEXT);
    CREATE TABLE "SstMedicalCertificate" (id TEXT PRIMARY KEY,"leaveId" TEXT);
    CREATE TABLE "SstMedicalAssessment" (id TEXT PRIMARY KEY);
    INSERT INTO "BudgetUnit" VALUES ('ug','s'),('other','s');
    INSERT INTO "GovernmentEntity" VALUES ('entity'),('otherEntity');
    INSERT INTO "Employee" VALUES ('e'); INSERT INTO "HrEmploymentRegime" VALUES ('regime');
    INSERT INTO "Role" VALUES ('cargo'),('funcao'); INSERT INTO "Department" VALUES ('d','s');
    INSERT INTO "AdministrativeUnit" VALUES ('l','s'),('foreign','foreign');
    INSERT INTO "CostCenter" VALUES ('c','entity','s','d','l'),('foreign','otherEntity','s','d','l');
    INSERT INTO "Person" VALUES ('person'); INSERT INTO "SstExposureGroup" VALUES ('g');
    INSERT INTO "SstOccupationalProgram" VALUES ('program','ug','PGR','2026-10-01','2027-01-01');
    INSERT INTO "SstProgramExposureGroup" VALUES ('pg','program','g','{"departmentIds":["d"],"roleIds":["cargo"],"startsAt":"2026-10-01","endsAt":"2027-01-01"}'); INSERT INTO "SstCertificateReason" VALUES ('reason');
    INSERT INTO "Leave" VALUES ('leave','Ativa',CURRENT_TIMESTAMP,'e'); INSERT INTO "SstMedicalCertificate" VALUES ('cert','leave');
  `);
  await db.exec(readFileSync("prisma/migrations-ibema/20261011070000_add_sst_functional_history/migration.sql", "utf8"));
  return db;
}
const mapping = `INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES ('map','ug','entity','Ato oficial entidade UG 123','user')`;
function insertPeriod(id: string, starts = "2026-10-01", ends = "2026-11-01", extra = "NULL,false", local = "l", center = "c", unit = "ug") {
  return `INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","functionRoleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference","supersedesId",voided,snapshot,"requestHash","createdById") VALUES ('${id}','e','${unit}','entity','regime','cargo','funcao','d','${local}','${center}','${starts}','${ends}','Contrato 123','Ato oficial 123',${extra},'{}','hash','user')`;
}
test("migration rejects unverified same-secretariat UG and mismatched local/cost center", async () => {
  const db = await database();
  try {
    await assert.rejects(db.exec(insertPeriod("p")), /Verified UG/);
    await db.exec(mapping);
    await assert.rejects(db.exec(insertPeriod("other", undefined, undefined, undefined, "l", "c", "other")), /Verified UG/);
    await assert.rejects(db.exec(insertPeriod("foreign", undefined, undefined, undefined, "foreign")), /Incompatible functional scope/);
    await assert.rejects(db.exec(insertPeriod("foreign", undefined, undefined, undefined, "l", "foreign")), /Incompatible functional scope/);
    await db.exec(insertPeriod("p"));
    await assert.rejects(db.exec(`UPDATE "HrBudgetUnitEntityMapping" SET "governmentEntityId"='otherEntity'`), /immutable/);
  } finally { await db.close(); }
});
test("correction/anulation preserves immutable periods, excludes predecessors and prevents overlaps", async () => {
  const db = await database();
  try {
    await db.exec(mapping); await db.exec(insertPeriod("p"));
    await assert.rejects(db.exec(insertPeriod("overlap", "2026-10-15", "2026-11-15")), /Overlapping/);
    await db.exec(insertPeriod("next", "2026-11-01", "2026-12-01"));
    await db.exec(insertPeriod("correction", "2026-10-02", "2026-11-01", "'p',false"));
    await assert.rejects(db.exec(insertPeriod("stale", "2026-10-02", "2026-11-01", "'p',false")), /current same-scope/);
    await assert.rejects(db.exec(`DELETE FROM "HrEmployeeFunctionalPeriod" WHERE id='p'`), /immutable/);
    await db.exec(insertPeriod("void", "2026-10-02", "2026-11-01", "'correction',true"));
    const { rows } = await db.query<{ id: string }>(`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`);
    assert.deepEqual(rows.map((r) => r.id), ["next"]);
  } finally { await db.close(); }
});
test("responsibilities, orders and revocations retain canonical references and immutable snapshots", async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO "SstTechnicalResponsibility" (id,"budgetUnitId","personId",kind,"groupId",council,"sourceReference","startsAt","endsAt",snapshot,"requestHash","createdById") VALUES ('resp','ug','person','ENVIRONMENTAL','g','CREA PR 123','Ato oficial 123','2026-10-01','2027-01-01','{}','hash','user');
      INSERT INTO "SstServiceOrder" (id,"budgetUnitId","programGroupId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements","equipmentRequirements",snapshot,"requestHash","createdById") VALUES ('order','ug','pg','resp','2026-10-01','2026-11-01','Prevenir exposição','NR-6','Primeiros socorros','[]','[]','{"risks":["ruido"]}','hash','user');
      INSERT INTO "SstFoundationalRevocation" (id,"serviceOrderId",reason,"createdById") VALUES ('revoke','order','Substituir fonte incorreta','user');`);
    await assert.rejects(db.exec(`UPDATE "SstServiceOrder" SET snapshot='{}' WHERE id='order'`), /immutable/);
    await assert.rejects(db.exec(`INSERT INTO "SstServiceOrder" (id,"budgetUnitId","programGroupId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements","equipmentRequirements",snapshot,"requestHash","createdById") SELECT 'foreign','other',"programGroupId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements","equipmentRequirements",snapshot,'hash','user' FROM "SstServiceOrder" WHERE id='order'`), /authorized risk version/);
    await assert.rejects(db.exec(`INSERT INTO "SstServiceOrder" (id,"budgetUnitId","programGroupId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements","equipmentRequirements",snapshot,"requestHash","createdById") SELECT 'bad-material',"budgetUnitId","programGroupId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements",'[{"materialId":"invented"}]',snapshot,'hash','user' FROM "SstServiceOrder" WHERE id='order'`), /Canonical material/);
    await assert.rejects(db.exec(`DELETE FROM "SstFoundationalRevocation"`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "Person" WHERE id='person'`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "SstFoundationalRevocation" (id,"serviceOrderId",reason,"createdById") VALUES ('duplicate','order','Duplicar decisão','user')`), /unique/);
  } finally { await db.close(); }
});
test("rectification protects previous canonical Leave even after unlinking current certificate", async () => {
  const db = await database();
  try {
    await assert.rejects(db.exec(`UPDATE "Leave" SET status='Editada RH' WHERE id='leave'`), /SST-origin/);
    await db.exec(`BEGIN; SELECT set_config('sst.certificate_revision','on',true); UPDATE "Leave" SET status='Revogada SST' WHERE id='leave';
      INSERT INTO "SstCertificateDecisionRevision" (id,"certificateId","previousStatus",decision,reason,"examinerPersonId","examinerCouncil","previousLeaveId",reconciliation,"createdById") VALUES ('rev','cert','APPROVED','REVOKED','Revogação justificada','person','CRM PR 123','leave','{"status":"PENDING_CANONICAL_PAYROLL_ORIGIN"}','user');
      UPDATE "SstMedicalCertificate" SET "leaveId"=NULL WHERE id='cert'; COMMIT;`);
    await assert.rejects(db.exec(`UPDATE "Leave" SET status='Ativa' WHERE id='leave'`), /SST-origin/);
    await assert.rejects(db.exec(`DELETE FROM "SstCertificateDecisionRevision"`), /immutable/);
  } finally { await db.close(); }
});
