import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { sstTestContext } from "./helpers/sst-drizzle-context";
import { sstDatabaseError } from "./helpers/sst-database-error";
import { withDatabaseTransaction } from "../src/db/transaction";
import { reconcileCertificateLeavePayroll } from "../src/lib/sst/functional-leave-posting";
import { assertCertificatePayrollReconciliation } from "../src/lib/sst/functional-certificate-service";

const monetaryRule = {
  originKind: "SST_CERTIFICATE_LEAVE", employmentRegimeIds: ["regime"], leaveTypes: ["Licença médica"], effect: "CANONICAL_CALCULATION_REQUIRED",
  rubricId: "leave-rubric", eventId: "leave-event",
  calculation: { version: 1, mode: "RATE_PER_ATTESTED_MINUTE", currency: "BRL", rateBRLPerMinute: "0.001", rounding: { mode: "HALF_UP", scale: 2 }, legalReference: "Lei aprovada 123/2026", sourceReference: "Ato RH aprovado com tarifa por minuto 123/2026" },
  reversal: { rubricId: "refund-rubric", eventId: "refund-event", legalReference: "Lei aprovada 123/2026" },
};
async function fixture() {
  const local = await createLocalDrizzleDatabase(), db = local.database;
  try {
    await db.exec(`
    CREATE TABLE "BudgetUnit"(id TEXT PRIMARY KEY); CREATE TABLE "GovernmentEntity"(id TEXT PRIMARY KEY);
    CREATE TABLE "Employee"(id TEXT PRIMARY KEY); CREATE TABLE "HrBudgetUnitEntityMapping"("budgetUnitId" TEXT,"governmentEntityId" TEXT);
    CREATE TABLE "Company"(id TEXT PRIMARY KEY); CREATE TABLE "Supplier"(id TEXT PRIMARY KEY,"companyId" TEXT);
    CREATE TABLE "BenefitConfig"(id TEXT PRIMARY KEY,"supplierId" TEXT); CREATE TABLE "PayrollBenefit"(id TEXT PRIMARY KEY,"employeeId" TEXT,"benefitConfigId" TEXT);
    CREATE TABLE "Dependent"(id TEXT PRIMARY KEY,"employeeId" TEXT);
    CREATE TABLE "HrPayrollRuleSet"(id TEXT PRIMARY KEY,status TEXT,scope TEXT,"isDemo" BOOLEAN,"approvedAt" TIMESTAMP,"effectiveFrom" TIMESTAMP,"effectiveUntil" TIMESTAMP);
    CREATE TABLE "HrPayrollRule"(id TEXT PRIMARY KEY,"ruleSetId" TEXT,category TEXT,"valueType" TEXT,value JSONB,"isActive" BOOLEAN,"legalReference" TEXT);
    CREATE TABLE "HrPayrollRubric"(id TEXT PRIMARY KEY,code TEXT,name TEXT,type TEXT,"isActive" BOOLEAN,"calculationMethod" TEXT,"ruleSetId" TEXT REFERENCES "HrPayrollRuleSet"(id));
    CREATE TABLE "HrEmploymentRegime"(id TEXT PRIMARY KEY,"ruleSetId" TEXT,"isActive" BOOLEAN);
    CREATE TABLE "HrCalculationPolicy"(id TEXT PRIMARY KEY,"ruleSetId" TEXT,currency TEXT,"roundingMode" TEXT,"roundingScale" INTEGER,"negativeNetPayPolicy" TEXT);
    CREATE TABLE "HrEmployeeFunctionalPeriod"(id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,"employmentRegimeId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,voided BOOLEAN,"supersedesId" TEXT);
    CREATE TABLE "ConfiguracaoModulo"(codigo TEXT PRIMARY KEY,ativo BOOLEAN);
    CREATE TABLE "Payroll"(id TEXT PRIMARY KEY,competence TEXT,type TEXT,status TEXT,"totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE "PayrollEvent"(id TEXT PRIMARY KEY,code TEXT UNIQUE,name TEXT,type TEXT,formula TEXT,"isActive" BOOLEAN);
    CREATE TABLE "PayrollItem"(id TEXT PRIMARY KEY,"payrollId" TEXT REFERENCES "Payroll"(id) ON DELETE CASCADE,"employeeId" TEXT,"eventId" TEXT REFERENCES "PayrollEvent"(id),value DOUBLE PRECISION NOT NULL,reference TEXT,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP);
    CREATE TABLE "AuditEvent"(id TEXT PRIMARY KEY,"actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE "SstMedicalCertificate"(id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"leaveId" TEXT,status TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
    CREATE TABLE "Leave"(id TEXT PRIMARY KEY,"employeeId" TEXT,type TEXT,status TEXT,"startDate" TIMESTAMP,"endDate" TIMESTAMP);
    CREATE TABLE "SstMedicalAssessment"(id TEXT PRIMARY KEY,"certificateId" TEXT,decision TEXT,"assessedAt" TIMESTAMP);
    CREATE TABLE "SstCertificateDecisionRevision"(id TEXT PRIMARY KEY,"certificateId" TEXT,decision TEXT,"newLeaveId" TEXT,revision INTEGER);
    CREATE TABLE "SstCertificateFunctionalSource"("certificateId" TEXT PRIMARY KEY,"functionalPeriodId" TEXT);
    CREATE TABLE "SstPlannedShift"(id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
    CREATE FUNCTION sst_foundational_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable history'; END $$;
    INSERT INTO "BudgetUnit" VALUES('ug'),('foreign'); INSERT INTO "GovernmentEntity" VALUES('entity'),('otherEntity'); INSERT INTO "Employee" VALUES('employee');
    INSERT INTO "HrBudgetUnitEntityMapping" VALUES('ug','entity'),('foreign','otherEntity');
    INSERT INTO "HrPayrollRuleSet" VALUES('rules','ATIVA','PRODUCAO',false,'2026-01-01','2026-01-01','2028-01-01');
    INSERT INTO "HrPayrollRubric" VALUES('leave-rubric','L','Reflexo explícito','DESCONTO',true,'MANUAL','rules'),('refund-rubric','R','Compensação explícita','PROVENTO',true,'MANUAL','rules');
    INSERT INTO "HrEmploymentRegime" VALUES('regime','rules',true); INSERT INTO "HrCalculationPolicy" VALUES('policy','rules','BRL','HALF_UP',2,'BLOQUEAR');
    INSERT INTO "HrEmployeeFunctionalPeriod" VALUES('history','employee','ug','entity','regime','2026-01-01','2028-01-01',false,NULL);
    INSERT INTO "ConfiguracaoModulo" VALUES('RH',true),('SST',true);
    INSERT INTO "PayrollEvent" VALUES('leave-event','L','Reflexo','Desconto',NULL,true),('refund-event','R','Crédito','Vencimento',NULL,true),('salary-event','S','Salário','Vencimento',NULL,true);
    INSERT INTO "Payroll"(id,competence,type,status) VALUES('pay','10/2026','Mensal','Aberta'),('next','11/2026','Mensal','Aberta'),('unscoped','12/2026','Mensal','Aberta');
    INSERT INTO "PayrollItem"(id,"payrollId","employeeId","eventId",value) VALUES('salary','pay','employee','salary-event',1000.00),('next-salary','next','employee','salary-event',1000.00);
    INSERT INTO "SstMedicalCertificate" VALUES('cert','employee','ug','leave','APPROVED','2026-10-10 08:00','2026-10-10 14:00');
    INSERT INTO "Leave" VALUES('leave','employee','Licença médica','Ativa','2026-10-10 08:00','2026-10-10 14:00');
    INSERT INTO "SstMedicalAssessment" VALUES('assessment','cert','APPROVED','2026-10-10'); INSERT INTO "SstCertificateFunctionalSource" VALUES('cert','history');
    INSERT INTO "SstPlannedShift" VALUES('s1','employee','ug','2026-10-10 08:00','2026-10-10 12:00'),('s2','employee','ug','2026-10-10 10:00','2026-10-10 13:00'),('foreign','employee','foreign','2026-10-10 08:00','2026-10-10 22:00');
    `);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011050000_add_sst_health_benefits/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations-ibema/20261011090000_add_sst_payroll_origins/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations-ibema/20261011110000_add_sst_leave_payroll_origins/migration.sql", "utf8"));
    await db.query(`INSERT INTO "HrPayrollRule" VALUES('rule','rules','CALCULO','JSON',$1,true,'Lei aprovada 123/2026')`, [JSON.stringify(monetaryRule)]);
    await db.exec(`INSERT INTO "SstBenefitPayrollScope"("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES('pay','ug','entity','10/2026','user'),('next','ug','entity','11/2026','user');`);
    await db.exec(`CREATE TABLE "SstAccessGrant" (id TEXT PRIMARY KEY,"usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now());
    INSERT INTO "SstAccessGrant" (id,"usuarioId","budgetUnitId","isActive","canReadClinical","canAssess") VALUES ('grant','user','ug',true,true,true),('reader-grant','reader','ug',true,false,false);`);
    const context = sstTestContext(local.connection.db, { permissions: JSON.stringify({ modules: { SST: { update: true }, RH: { update: true } } }) });
    return { db, context, connection: local.connection, close: local.close };
  } catch (error) { await local.close(); throw error; }
}
const posting = { operation: "POST", certificateId: "cert", payrollId: "pay", ruleId: "rule" };
const countOrigins = async (db: PGlite) => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstLeavePayrollOrigin"`)).rows[0].n;

test("approved configured monetary rule posts native exact amount, union minutes, authoritative totals and immutable decision FK once", async () => {
  const { db, context, close } = await fixture();
  try {
    const result = await reconcileCertificateLeavePayroll(context, posting);
    assert.equal(result.status, "POSTED"); assert.equal(result.amount, "0.30");
    const [origin] = (await db.query<{ minutes: string; amount: string; assessmentId: string; total: string }>(`SELECT o."attestedMinutes"::text AS minutes,o."amountDecimal"::text AS amount,o."assessmentId",p."totalValueDecimal"::text AS total FROM "SstLeavePayrollOrigin" o JOIN "Payroll" p ON p.id=o."payrollId"`)).rows;
    assert.equal(origin.minutes, "300.0000000000"); assert.equal(origin.amount, "0.30"); assert.equal(origin.assessmentId, "assessment"); assert.equal(origin.total, "999.70");
    assert.equal((await reconcileCertificateLeavePayroll(context, posting)).status, "ALREADY_POSTED");
    const replay = await Promise.all([1,2].map(() => db.query<{ result: { status: string } }>(`SELECT sst_post_certificate_leave('cert','pay','rule',$1,'user') AS result`,[randomUUID()])));
    assert.ok(replay.every((r) => r.rows[0].result.status === "ALREADY_POSTED"));
    assert.equal(await countOrigins(db), 1);
    await assert.rejects(db.exec(`UPDATE "PayrollItem" SET value=99,"valueDecimal"=99 WHERE id='${result.payrollItemId}'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstLeavePayrollRuleVersion"`), /Immutable/);
    await assert.rejects(db.exec(`UPDATE "SstMedicalCertificate" SET status='REVOKED' WHERE id='cert'`), /compensation before decision/);
    const audit = (await db.query(`SELECT "targetType","targetId" FROM "AuditEvent"`)).rows;
    assert.doesNotMatch(JSON.stringify(audit), /Licença|rateBRL|attestedMinutes/);
  } finally { await close(); }
});
test("missing calculation, legal approval, production regime and closed payroll block without mutation", async () => {
  const { db, context, close } = await fixture();
  try {
    await db.exec(`UPDATE "HrPayrollRule" SET value=value-'calculation'`);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, posting)).blockers, ["APPROVED_MONETARY_CALCULATION_REQUIRED"]);
    await db.query(`UPDATE "HrPayrollRule" SET value=$1,"legalReference"='Wrong legal act'`, [JSON.stringify(monetaryRule)]);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, posting)).blockers, ["APPROVED_MONETARY_CALCULATION_REQUIRED"]);
    await db.exec(`UPDATE "HrPayrollRule" SET "legalReference"='Lei aprovada 123/2026'; UPDATE "HrPayrollRuleSet" SET "isDemo"=true`);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, posting)).blockers, ["APPROVED_PRODUCTION_REGIME_RULE_REQUIRED"]);
    await db.exec(`UPDATE "HrPayrollRuleSet" SET "isDemo"=false; UPDATE "Payroll" SET status='Fechada' WHERE id='pay'`);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, posting)).blockers, ["PAYROLL_CLOSED"]);
    assert.equal(await countOrigins(db), 0);
  } finally { await close(); }
});
test("overlapping clinical cases and already calculated legacy event cannot duplicate monetary effects", async () => {
  const { db, context, close } = await fixture();
  try {
    await db.exec(`INSERT INTO "PayrollItem"(id,"payrollId","employeeId","eventId",value) VALUES('legacy','pay','employee','leave-event',0.30)`);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, posting)).blockers, ["EXISTING_CALCULATED_EVENT_REQUIRES_RECONCILIATION"]);
    await db.exec(`DELETE FROM "PayrollItem" WHERE id='legacy'`);
    await reconcileCertificateLeavePayroll(context, posting);
    await db.exec(`INSERT INTO "SstMedicalCertificate" VALUES('overlap','employee','ug','overlap-leave','APPROVED','2026-10-10 11:00','2026-10-10 15:00'); INSERT INTO "Leave" VALUES('overlap-leave','employee','Licença médica','Ativa','2026-10-10 11:00','2026-10-10 15:00'); INSERT INTO "SstMedicalAssessment" VALUES('overlap-decision','overlap','APPROVED','2026-10-10'); INSERT INTO "SstCertificateFunctionalSource" VALUES('overlap','history');`);
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, { ...posting, certificateId: "overlap" })).blockers, ["OVERLAPPING_ATTESTED_ORIGIN_REQUIRES_RECONCILIATION"]);
    assert.equal(await countOrigins(db), 1);
  } finally { await close(); }
});
test("approved compensatory credit preserves paid/closed original and posts exact amount to open competence idempotently", async () => {
  const { db, context, connection, close } = await fixture();
  try {
    const post = await reconcileCertificateLeavePayroll(context, posting);
    const reconcile = () => withDatabaseTransaction(connection, tx => assertCertificatePayrollReconciliation(tx,"employee",new Date("2026-10-10T08:00Z"),new Date("2026-10-10T14:00Z"),"cert"));
    await assert.rejects(reconcile(), /Compense todas/);
    await db.exec(`UPDATE "Payroll" SET status='Fechada' WHERE id='pay'; UPDATE "Payroll" SET status='Paga' WHERE id='pay'; UPDATE "HrPayrollRule" SET value=value-'reversal'`);
    const reverse = { operation: "REVERSE", certificateId: "cert", payrollId: "next", ruleId: "rule", originId: post.originId, reason: "Compensação formal aprovada do reflexo anterior" };
    assert.deepEqual((await reconcileCertificateLeavePayroll(context, reverse)).blockers, ["APPROVED_REVERSAL_MAPPING_REQUIRED"]);
    await db.query(`UPDATE "HrPayrollRule" SET value=$1`, [JSON.stringify(monetaryRule)]);
    const result = await reconcileCertificateLeavePayroll(context, reverse);
    assert.equal(result.status, "POSTED"); assert.equal(result.amount, "0.30");
    assert.equal((await reconcileCertificateLeavePayroll(context, reverse)).status, "ALREADY_POSTED");
    const rows = (await db.query<{ id: string; status: string; total: string }>(`SELECT id,status,"totalValueDecimal"::text AS total FROM "Payroll" WHERE id IN('pay','next') ORDER BY id`)).rows;
    assert.deepEqual(rows, [{ id: "next", status: "Aberta", total: "1000.30" }, { id: "pay", status: "Paga", total: "999.70" }]);
    await assert.rejects(db.exec(`UPDATE "Payroll" SET status='Aberta' WHERE id='pay'`), /compensatory open competence/);
    assert.equal(await countOrigins(db), 2);
    assert.equal((await reconcile()).status, "RECONCILED_CANONICAL_LEAVE_COMPENSATION");
    await db.exec(`UPDATE "SstMedicalCertificate" SET status='REVOKED',"leaveId"=NULL WHERE id='cert'`);
  } finally { await close(); }
});
test("precision failure rolls back scope, rule version, origin and monetary item; native HALF_UP is explicit", async () => {
  const { db, context, close } = await fixture();
  try {
    await db.exec(`UPDATE "PayrollItem" SET value=1000.001 WHERE id='salary'`);
    const payrollState = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "Payroll" p) AS payrolls,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "PayrollItem" i) AS items,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY "payrollId") FROM "SstBenefitPayrollScope" s) AS scopes,
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM "SstLeavePayrollScopeEvidence" e) AS evidence,
      (SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM "SstLeavePayrollRuleVersion" v) AS versions,
      (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM "SstLeavePayrollOrigin" o) AS origins,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM "AuditEvent" a) AS audits`)).rows;
    const before = await payrollState();
    await assert.rejects(reconcileCertificateLeavePayroll(context, posting), sstDatabaseError("P0001", /LEGACY_FLOAT_PRECISION_UNSUPPORTED/));
    assert.deepEqual(await payrollState(), before);
    assert.equal(await countOrigins(db), 0);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstLeavePayrollRuleVersion"`)).rows[0].n, 0);
    await db.exec(`UPDATE "PayrollItem" SET value=1000 WHERE id='salary'; UPDATE "SstMedicalCertificate" SET "endsAt"='2026-10-10 08:01'; UPDATE "Leave" SET "endDate"='2026-10-10 08:01';`);
    const rounding = { ...monetaryRule, calculation: { ...monetaryRule.calculation, rateBRLPerMinute: "0.015" } };
    await db.query(`UPDATE "HrPayrollRule" SET value=$1`, [JSON.stringify(rounding)]);
    assert.equal((await reconcileCertificateLeavePayroll(context, posting)).amount, "0.02");
    const invalid = { ...posting, payrollId: "unscoped", confirmPayrollScope: true, scopeSourceReference: "Ato oficial da UG e folha dezembro" };
    const beforeBlocked = await payrollState();
    assert.equal((await reconcileCertificateLeavePayroll(context, invalid)).status, "BLOCKED");
    assert.deepEqual(await payrollState(), beforeBlocked);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstBenefitPayrollScope" WHERE "payrollId"='unscoped'`)).rows[0].n, 0);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstLeavePayrollScopeEvidence"`)).rows[0].n, 0);
  } finally { await close(); }
});
test("SST/RH/clinical/UG authorization guards actual posting; different entity scope cannot be inferred", async () => {
  const { db, context, close } = await fixture();
  try {
    await assert.rejects(reconcileCertificateLeavePayroll({ ...context, user: { ...context.user, allowedBudgetUnitIds: ["foreign"] } }, posting), /Acesso negado/);
    await assert.rejects(reconcileCertificateLeavePayroll({ ...context, user: { ...context.user, permissions: JSON.stringify({ modules: { SST: { update: true }, RH: { update: false } } }) } }, posting), /alteração SST e RH/);
    const reader = { ...context, user: { ...context.user, id: "reader" } };
    await assert.rejects(reconcileCertificateLeavePayroll(reader, posting), /clínica/);
    assert.equal(await countOrigins(db), 0);
    await db.exec(`INSERT INTO "Payroll"(id,competence,type,status) VALUES('foreign-pay','10/2026','Mensal','Aberta'); INSERT INTO "SstBenefitPayrollScope"("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES('foreign-pay','foreign','otherEntity','10/2026','user')`);
    const multipleUnits = { ...context, user: { ...context.user, allowedBudgetUnitIds: ["ug","foreign"] } };
    assert.deepEqual((await reconcileCertificateLeavePayroll(multipleUnits,{ ...posting,payrollId: "foreign-pay" })).blockers,["PAYROLL_CERTIFICATE_UG_MISMATCH"]);
    const direct = await db.query<{ result: { status: string } }>(`SELECT sst_post_certificate_leave('cert','pay','rule',$1,'user') AS result`, [randomUUID()]);
    assert.equal(direct.rows[0].result.status, "POSTED");
  } finally { await close(); }
});
