import assert from "node:assert/strict";
import test from "node:test";
import { availableSlots, availabilityInput, boardInput } from "../src/lib/sst/agenda-policy";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

test("occupation blocks only intersecting slots and permits contiguous appointments", () => {
  const date = (hour: string) => new Date(`2026-10-12T${hour}:00-03:00`);
  const slots = availableSlots({ startsAt: date("08:00"), endsAt: date("10:00"), slotMinutes: 30 }, [{ startsAt: date("08:30"), endsAt: date("09:00") }, { startsAt: date("09:15"), endsAt: date("09:45") }]);
  assert.deepEqual(slots.map((item) => item.startsAt.toISOString()), [date("08:00").toISOString()]);
  assert.throws(() => availableSlots({ startsAt: date("08:00"), endsAt: date("10:00"), slotMinutes: 0 }, []), /inválida/);
});
test("board membership cannot duplicate a professional and availability is bounded", () => {
  assert.equal(boardInput.safeParse({ budgetUnitId: "ug", name: "Junta", startsAt: "2026-10-01", endsAt: "2026-10-30", members: [{ personId: "p", council: "CRM 1" }, { personId: "p", council: "CRM 1" }] }).success, false);
  assert.equal(availabilityInput.safeParse({ budgetUnitId: "ug", professionalPersonId: "p", unitName: "Clínica", startsAt: "2026-10-01", endsAt: "2027-10-01", slotMinutes: 30 }).success, false);
});
test("agenda migration snapshots legacy reasons and restricts deleting linked records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Employee" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY);
      CREATE TABLE "SstMedicalCertificate" (id TEXT PRIMARY KEY, "reasonId" TEXT);
      CREATE TABLE "SstCertificateReason" (id TEXT PRIMARY KEY, name TEXT, "createLeaveOnApproval" BOOLEAN, "leaveType" TEXT, "suggestLeave" BOOLEAN, "printReceipt" BOOLEAN);
      CREATE TABLE "SstMedicalAssessment" (id TEXT PRIMARY KEY);
      INSERT INTO "SstCertificateReason" VALUES ('r', 'Médico', true, 'Licença médica', false, false);
      INSERT INTO "SstMedicalCertificate" VALUES ('c','r'); INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Employee" VALUES ('e'); INSERT INTO "Person" VALUES ('p');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010160000_add_sst_agenda_boards/migration.sql", "utf8"));
    const snapshot = (await db.query<{ reasonSnapshot: { leaveType: string } }>('SELECT "reasonSnapshot" FROM "SstMedicalCertificate"')).rows[0].reasonSnapshot;
    assert.equal(snapshot.leaveType, "Licença médica");
    await db.exec(`INSERT INTO "SstScheduleAvailability" (id, "budgetUnitId", "professionalPersonId", "unitName", "startsAt", "endsAt", "slotMinutes", "createdById", "updatedAt") VALUES ('a','ug','p','Clínica','2026-10-12 08:00','2026-10-12 10:00',30,'u',now());
      INSERT INTO "SstAppointment" (id,"availabilityId","employeeId",purpose,"startsAt","endsAt","createdById","updatedAt") VALUES ('appointment','a','e','EXAME','2026-10-12 08:00','2026-10-12 08:30','u',now());`);
    await assert.rejects(db.exec(`DELETE FROM "SstScheduleAvailability" WHERE id='a'`), /foreign key/);
    await assert.rejects(db.exec(`UPDATE "SstAppointment" SET "endsAt"="startsAt" WHERE id='appointment'`), /check constraint/);
  } finally { await db.close(); }
});
