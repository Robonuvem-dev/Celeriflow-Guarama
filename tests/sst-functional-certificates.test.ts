import assert from "node:assert/strict";
import test from "node:test";
import { createSstClinicalFixture } from "./helpers/sst-clinical-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { certificateFunctionalSource, assertCertificatePayrollReconciliation, reviseCertificateDecision } from "../src/lib/sst/functional-certificate-service";
import { listCertificatesWithFunctionalFilters } from "../src/lib/sst/functional-certificate-list";
import { getAuthorizedHistoricalExposure } from "../src/lib/sst/functional-service";
import { registerCertificate, assessCertificate } from "../src/lib/sst/certificate-service";

test("certificate regimes use historical employee period, never current cargo or secretariat inference", async () => {
  const f = await createSstClinicalFixture();
  try {
    const input = { employeeId: "employee", budgetUnitId: "ug", reasonId: "reason", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-02") };
    await f.database.exec(`UPDATE "Employee" SET "roleId"=NULL,"secretariatId"='wrong-current';
      INSERT INTO "SstReasonRegimePolicy" (id,"reasonId",version,"restrictedRegimeIds",justification,"createdById") VALUES ('policy','reason',1,ARRAY['regime'],'Restrição contratual','user')`);
    await assert.rejects(withDatabaseTransaction(f.connection, tx => certificateFunctionalSource(tx, input)), /regime contratual/);
    await assert.rejects(withDatabaseTransaction(f.connection, tx => certificateFunctionalSource(tx, { ...input, startsAt: new Date("2025-10-01"), endsAt: new Date("2025-10-02") })), /período funcional RH explícito/);
  } finally { await f.close(); }
});
test("closed or computed payroll blocks reversal; no entries reports pending canonical origin", async () => {
  const f = await createSstClinicalFixture();
  try {
    const start = new Date("2026-11-01T01:00:00Z"), end = new Date("2026-11-01T03:00:00Z");
    const reconcile = () => withDatabaseTransaction(f.connection, tx => assertCertificatePayrollReconciliation(tx, "employee", start, end));
    await f.database.exec(`INSERT INTO "Payroll" VALUES ('payroll','10/2026','Fechada'); INSERT INTO "PayrollItem" VALUES ('item','payroll','employee','event')`);
    await assert.rejects(reconcile(), /fechada\/paga/);
    await f.database.exec(`UPDATE "Payroll" SET status='Aberta'`);
    await assert.rejects(reconcile(), /origem canônica/);
    await f.database.exec(`UPDATE "Payroll" SET status='Paga',competence='unknown'`);
    await assert.rejects(reconcile(), /formato canônico/);
    await f.database.exec('DELETE FROM "PayrollItem"');
    assert.deepEqual(await reconcile(), { status: "PENDING_CANONICAL_PAYROLL_ORIGIN", source: "SST_CERTIFICATE_DECISION", financialEntriesCreated: false, paymentStatus: "NOT_VERIFIED" });
  } finally { await f.close(); }
});
test("administrative historical filters authorize UG before count or listing", async () => {
  const f = await createSstClinicalFixture();
  try {
    // Missing relation makes any premature clinical query fail distinctly.
    await f.database.exec('ALTER TABLE "SstMedicalCertificate" RENAME TO "HiddenCertificate"');
    await assert.rejects(listCertificatesWithFunctionalFilters(f.context, { budgetUnitId: "foreign", employmentRegimeId: "regime" }), /Unidade Gestora/);
  } finally { await f.close(); }
});
test("PPP source exposes gaps and overlapping programme versions instead of guessing one", async () => {
  const f = await createSstClinicalFixture();
  try {
    await f.database.exec(`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('e','Servidor com lacuna',now());
      INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference",snapshot,"requestHash","createdById") VALUES ('gap','e','ug','entity','regime','historical-role','department','local','center','2026-10-02','2026-10-03','Contrato oficial','Documento oficial','{}','hash','user');
      INSERT INTO "SstOccupationalProgram" (id,"budgetUnitId",code,kind,version,"startsAt","endsAt","responsiblePersonId","responsibleCouncil","responsibleSnapshot",content,"createdById") SELECT 'ltcat-'||n,'ug','LTCAT','LTCAT',n,'2026-10-01','2026-11-01','doctor','CRM PR 123','{}','{}','user' FROM generate_series(1,2) n;
      INSERT INTO "SstProgramExposureGroup" (id,"programId","groupId","groupSnapshot",risks,exams) SELECT 'ltcat-group-'||n,'ltcat-'||n,'g','{"departmentIds":["department"],"roleIds":["historical-role"],"startsAt":"2026-10-01","endsAt":"2026-11-01"}','[{"description":"Ruído"}]','[]' FROM generate_series(1,2) n`);
    const result = await getAuthorizedHistoricalExposure(f.context, "e", "ug", new Date("2026-10-01"), new Date("2026-10-04"));
    assert.equal(result.exposure.filter(row => row.kind === "LTCAT").length, 2);
    assert.deepEqual(result.blockers, ["FUNCTIONAL_HISTORY_GAP", "OVERLAPPING_PROGRAM_VERSIONS"]);
    assert.equal(result.source, "HR_EMPLOYEE_FUNCTIONAL_HISTORY");
  } finally { await f.close(); }
});
test("rectification rejects stale revision and closed payroll before changing Leave or decision", async () => {
  const f = await createSstClinicalFixture();
  try {
    const certificate = await registerCertificate(f.context, { budgetUnitId: "ug", employeeId: "employee", reasonId: "reason", issuerPersonId: "doctor", issuerCouncil: "CRM PR 123", startsAt: "2026-10-01", endsAt: "2026-10-02", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" });
    await assessCertificate(f.context, { certificateId: certificate.id, examinerPersonId: "doctor", examinerCouncil: "CRM PR 123", decision: "APPROVED", opinion: "Deferimento após avaliação", assessedAt: "2026-10-03" });
    await f.database.exec(`INSERT INTO "Payroll" VALUES ('payroll','10/2026','Fechada'); INSERT INTO "PayrollItem" VALUES ('item','payroll','employee','event')`);
    const input = { certificateId: certificate.id, decision: "REVOKED", expectedStatus: "APPROVED", reason: "Revogação justificada", examinerPersonId: "doctor", examinerCouncil: "CRM PR 123" };
    await assert.rejects(reviseCertificateDecision(f.context, input), /fechada\/paga/);
    await f.database.query(`INSERT INTO "SstCertificateDecisionRevision" (id,"certificateId",revision,"previousStatus",decision,reason,"examinerPersonId","examinerCouncil",reconciliation,"createdById") VALUES ('newer',$1,1,'RECEIVED','APPROVED','Decisão concorrente','doctor','CRM PR 123','{}','user')`, [certificate.id]);
    await assert.rejects(reviseCertificateDecision(f.context, input), /outra operação/);
    assert.deepEqual((await f.database.query('SELECT status FROM "Leave"')).rows, [{ status: "Ativa" }]);
    assert.deepEqual((await f.database.query('SELECT status FROM "SstMedicalCertificate"')).rows, [{ status: "APPROVED" }]);
  } finally { await f.close(); }
});
