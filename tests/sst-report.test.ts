import test from "node:test";
import assert from "node:assert/strict";
import { certificateReport } from "../src/lib/sst/report-service";
import { createSstClinicalFixture } from "./helpers/sst-clinical-fixture";
import { registerCertificate, assessCertificate } from "../src/lib/sst/certificate-service";

test("absence report includes planned workers without certificates in its denominator", async () => {
  const date = (value: string) => new Date(`2026-10-10T${value}:00Z`);
  const f = await createSstClinicalFixture();
  try {
    await f.database.exec(`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('present','Presente',now());
      INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference",snapshot,"requestHash","createdById") SELECT 'present-period','present',"budgetUnitId","governmentEntityId","employmentRegimeId","roleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference",snapshot,'hash','user' FROM "HrEmployeeFunctionalPeriod" WHERE id='period';
      INSERT INTO "SstPlannedShift" (id,"employeeId","budgetUnitId","startsAt","endsAt","createdById") VALUES ('absent-shift','employee','ug','2026-10-10 08:00','2026-10-10 16:00','user'),('present-shift','present','ug','2026-10-10 08:00','2026-10-10 16:00','user');`);
    const certificate = await registerCertificate(f.context, { budgetUnitId: "ug", employeeId: "employee", reasonId: "reason", issuerPersonId: "doctor", issuerCouncil: "CRM PR 123", startsAt: date("08:00"), endsAt: date("12:00"), submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" });
    await assessCertificate(f.context, { certificateId: certificate.id, examinerPersonId: "doctor", examinerCouncil: "CRM PR 123", decision: "APPROVED", opinion: "Deferimento após avaliação", assessedAt: "2026-10-11" });
    const report = await certificateReport(f.context, { budgetUnitId: "ug", from: date("00:00"), until: date("23:59") });
    assert.equal(report.statistics.length, 2);
    assert.equal(report.statistics.reduce((sum, item) => sum + item.plannedMinutes, 0), 960);
    assert.equal(report.statistics.reduce((sum, item) => sum + item.absentMinutes, 0), 240);
    assert.equal(report.statistics.find((item) => item.employeeId === "present")?.certificateCount, 0);
  } finally { await f.close(); }
});
