import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { getAuthorizedCertificateLeaveOrigin } from "../src/lib/sst/functional-payroll-origin";

test("canonical Leave candidate binds explicit regime/rules and exact planned hours without inferring deductions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "SstMedicalCertificate" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"leaveId" TEXT,status TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
      CREATE TABLE "Leave" (id TEXT PRIMARY KEY,"employeeId" TEXT,type TEXT,status TEXT);
      CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,"employmentRegimeId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
      CREATE TABLE "SstCertificateFunctionalSource" ("certificateId" TEXT,"functionalPeriodId" TEXT);
      CREATE TABLE "HrBudgetUnitEntityMapping" ("budgetUnitId" TEXT,"governmentEntityId" TEXT);
      CREATE TABLE "HrEmploymentRegime" (id TEXT PRIMARY KEY,"ruleSetId" TEXT);
      CREATE TABLE "SstCertificateDecisionRevision" (id TEXT PRIMARY KEY,"certificateId" TEXT,"newLeaveId" TEXT,revision INTEGER);
      CREATE TABLE "SstMedicalAssessment" (id TEXT PRIMARY KEY,"certificateId" TEXT,decision TEXT,"assessedAt" TIMESTAMP);
      CREATE TABLE "HrPayrollRule" (id TEXT PRIMARY KEY,"ruleSetId" TEXT,category TEXT,"valueType" TEXT,value JSONB,"isActive" BOOLEAN);
      CREATE TABLE "HrPayrollRuleSet" (id TEXT PRIMARY KEY,status TEXT,scope TEXT,"isDemo" BOOLEAN,"approvedAt" TIMESTAMP,"effectiveFrom" TIMESTAMP,"effectiveUntil" TIMESTAMP);
      CREATE TABLE "SstPlannedShift" ("employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
      INSERT INTO "SstMedicalCertificate" VALUES ('cert','e','ug','leave','APPROVED','2026-10-10 08:00','2026-10-10 14:00');
      INSERT INTO "Leave" VALUES ('leave','e','Licença médica','Ativa');
      INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('period','e','ug','entity','regime','2026-10-01','2026-11-01');
      INSERT INTO "SstCertificateFunctionalSource" VALUES ('cert','period');
      INSERT INTO "HrBudgetUnitEntityMapping" VALUES ('ug','entity'); INSERT INTO "HrEmploymentRegime" VALUES ('regime','rules');
      INSERT INTO "SstMedicalAssessment" VALUES ('assessment','cert','APPROVED','2026-10-11');
      INSERT INTO "HrPayrollRuleSet" VALUES ('rules','ATIVA','PRODUCAO',false,'2026-09-01','2026-01-01','2027-01-01');
      INSERT INTO "HrPayrollRule" VALUES ('rule','rules','CALCULO','JSON','{"originKind":"SST_CERTIFICATE_LEAVE","employmentRegimeIds":["regime"],"leaveTypes":["Licença médica"],"effect":"NO_FINANCIAL_EFFECT"}',true);
      INSERT INTO "SstPlannedShift" VALUES ('e','ug','2026-10-10 08:00','2026-10-10 12:00'),('e','ug','2026-10-10 10:00','2026-10-10 13:00'),('e','foreign','2026-10-10 08:00','2026-10-10 22:00');`);
    const audits: unknown[] = [];
    let closed = false;
    const raw = async (sql: TemplateStringsArray, ...values: unknown[]) => { const q = Prisma.sql(sql, ...values); return (await db.query(q.text, q.values)).rows; };
    const tx = {
      $queryRaw: raw, $executeRaw: raw,
      payroll: { findMany: async () => closed ? [{ id: "payroll", status: "Fechada" }] : [] },
      hrPayrollRule: { findUnique: async () => {
        const [rule] = (await db.query<Record<string, unknown>>('SELECT * FROM "HrPayrollRule" WHERE id=\'rule\'')).rows;
        const [ruleSet] = (await db.query<Record<string, unknown>>('SELECT * FROM "HrPayrollRuleSet" WHERE id=\'rules\'')).rows;
        return { ...rule, ruleSet };
      } },
      sstPlannedShift: { findMany: async () => (await db.query('SELECT "startsAt","endsAt" FROM "SstPlannedShift" WHERE "employeeId"=\'e\' AND "budgetUnitId"=\'ug\'')).rows },
      auditEvent: { create: async ({ data }: { data: unknown }) => { audits.push(data); return {}; } },
    };
    const context = { user: { id: "u", profileCode: "OPERADOR", allowedBudgetUnitIds: ["ug"], modulePermissions: [], permissions: JSON.stringify({ modules: { SST: { blocked: false }, RH: { blocked: false, update: true } } }) }, prisma: { ...tx, $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => { await db.exec("BEGIN"); try { const result = await callback(tx); await db.exec("COMMIT"); return result; } catch (error) { await db.exec("ROLLBACK"); throw error; } } } } as unknown as AppContext;
    const rawInput = { certificateId: "cert", competence: "10/2026", ruleId: "rule" };
    const candidate = await getAuthorizedCertificateLeaveOrigin(context, rawInput);
    assert.deepEqual(candidate.blockers, []);
    assert.equal(candidate.attestedPlannedMinutes, 300);
    assert.equal(candidate.governmentEntityId, "entity");
    assert.equal(candidate.employmentRegimeId, "regime");
    assert.equal(candidate.originId, "cert:assessment:leave:10/2026");
    assert.equal(candidate.financialAmount, null);
    assert.equal(candidate.paymentStatus, "NOT_VERIFIED");
    assert.equal(candidate.status, "CANDIDATE_ONLY");
    assert.ok(candidate.configuration?.ruleValueHash);
    assert.equal((await getAuthorizedCertificateLeaveOrigin(context, { ...rawInput, ruleId: undefined })).blockers.includes("REGIME_LEAVE_RULE_NOT_CONFIGURED"), true);
    closed = true;
    assert.equal((await getAuthorizedCertificateLeaveOrigin(context, rawInput)).blockers.includes("CLOSED_COMPETENCE_RECONCILIATION_REQUIRED"), true);
    await db.exec(`UPDATE "HrPayrollRule" SET value=jsonb_set(value,'{employmentRegimeIds}','["other-regime"]'); UPDATE "HrPayrollRuleSet" SET scope='DEMONSTRACAO',"isDemo"=true`);
    const invalid = await getAuthorizedCertificateLeaveOrigin(context, rawInput);
    assert.ok(invalid.blockers.includes("REGIME_LEAVE_RULE_SCOPE_MISMATCH"));
    assert.ok(invalid.blockers.includes("PRODUCTION_RULE_SET_NOT_APPROVED"));
    assert.doesNotMatch(JSON.stringify(audits), /Licença médica|employmentRegime|financialAmount/);
  } finally { await db.close(); }
});
