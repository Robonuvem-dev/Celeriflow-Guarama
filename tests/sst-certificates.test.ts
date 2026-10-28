import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { absenceMinutes, assertCertificateReason, certificateInput } from "../src/lib/sst/certificate-policy";
import { assertSstClinicalAccess } from "../src/lib/sst/access";
import { assessCertificate, registerCertificate } from "../src/lib/sst/certificate-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createSstClinicalFixture } from "./helpers/sst-clinical-fixture";

test("absence uses real shifts, splits at competence boundaries and does not double count overlap", () => {
  const day = (time: string) => new Date(`2026-10-01T${time}:00Z`);
  const result = absenceMinutes([{ start: day("08:00"), end: day("12:00") }, { start: day("13:00"), end: day("17:00") }], [{ start: day("09:00"), end: day("14:00") }, { start: day("11:00"), end: day("15:00") }]);
  assert.deepEqual(result, { plannedMinutes: 480, absentMinutes: 300, index: 62.5 });
  assert.equal(absenceMinutes([], []).index, null);
});

test("invalid intervals, missing dependents and restricted roles are rejected", () => {
  assert.throws(() => assertCertificateReason({ dependentPolicy: "REQUIRED", restrictedRoleIds: [] }, null, ""), /dependente/);
  assert.throws(() => assertCertificateReason({ dependentPolicy: "DISABLED", restrictedRoleIds: [] }, null, "dep"), /dependente/);
  assert.throws(() => assertCertificateReason({ dependentPolicy: "OPTIONAL", restrictedRoleIds: ["role"] }, "role", ""), /cargo/);
  assert.equal(certificateInput.safeParse({ budgetUnitId: "ug", employeeId: "e", reasonId: "r", issuerPersonId: "p", issuerCouncil: "CRM PR 123", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", startsAt: "2026-10-01", endsAt: "2026-09-01" }).success, false);
});

const operator: AppContext["user"] = {
  id: "user", firebaseUid: "user", email: "sst@example.invalid", name: "SST", role: "SST", profileCode: "SST_OPERATOR",
  modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: null, departmentId: null, secretariatId: null,
};

test("SST module access alone cannot read diagnoses or assess and cross-UG access is denied", async () => {
  const f = await createSstClinicalFixture();
  try {
    f.context.user = { ...operator };
    await f.database.exec('UPDATE "SstAccessGrant" SET "isActive"=false');
    await assert.rejects(assertSstClinicalAccess(f.context, "ug"), /clínica/);
    await assert.rejects(assertSstClinicalAccess(f.context, "other"), /Unidade Gestora/);
    await f.database.exec('UPDATE "SstAccessGrant" SET "isActive"=true,"canAssess"=false');
    await assertSstClinicalAccess(f.context, "ug");
    await assert.rejects(assertSstClinicalAccess(f.context, "ug", true), /clínica/);
  } finally { await f.close(); }
});

test("assessment atomically claims state and cannot generate a second leave", async () => {
  const f = await createSstClinicalFixture();
  try {
    const certificate = await registerCertificate(f.context, { budgetUnitId: "ug", employeeId: "employee", reasonId: "reason", issuerPersonId: "doctor", issuerCouncil: "CRM PR 123", startsAt: "2026-10-01", endsAt: "2026-10-02", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" });
    f.context.user = { ...operator, profileCode: "ADMIN_TECNICO", permissions: JSON.stringify({ modules: { RH: { blocked: false, create: true } } }) };
    const input = { certificateId: certificate.id, examinerPersonId: "doctor", examinerCouncil: "CRM PR 123", decision: "APPROVED", opinion: "Afastamento deferido após avaliação.", assessedAt: "2026-10-03" };
    await assessCertificate(f.context, input);
    await assert.rejects(assessCertificate(f.context, input), /já possui uma decisão/);
    assert.equal((await f.database.query('SELECT id FROM "Leave"')).rows.length, 1);
    assert.equal((await f.database.query('SELECT id FROM "SstMedicalAssessment"')).rows.length, 1);
  } finally { await f.close(); }
});

test("retry of certificate submission reuses the original protocol without duplicating the record", async () => {
  const input = { budgetUnitId: "ug", employeeId: "employee", reasonId: "reason", issuerPersonId: "doctor", issuerCouncil: "CRM PR 123", startsAt: new Date("2026-10-01T08:00Z"), endsAt: new Date("2026-10-01T12:00Z"), submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
  const f = await createSstClinicalFixture();
  try {
    f.context.user = { ...operator };
    const original = await registerCertificate(f.context, input);
    assert.equal((await registerCertificate(f.context, input)).id, original.id);
    assert.equal((await f.database.query('SELECT id FROM "SstMedicalCertificate"')).rows.length, 1);
    await assert.rejects(registerCertificate(f.context, { ...input, endsAt: new Date("2026-10-01T14:00Z") }), /protocolo já foi utilizado/);
  } finally { await f.close(); }
});

test("additive migration protects canonical references and preserves legacy records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY);
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY);
      CREATE TABLE "Person" (id TEXT PRIMARY KEY);
      CREATE TABLE "Leave" (id TEXT PRIMARY KEY);
      CREATE TABLE "Process" (id TEXT PRIMARY KEY);
      CREATE TABLE "Dependent" (id TEXT PRIMARY KEY);
      CREATE TABLE "Usuario" (id TEXT PRIMARY KEY);
      CREATE TABLE "Document" (id TEXT PRIMARY KEY);
      CREATE TABLE "DocumentClass" (id TEXT PRIMARY KEY, code TEXT UNIQUE, label TEXT, "signaturePolicy" TEXT, "isActive" BOOLEAN, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP);
      INSERT INTO "Employee" VALUES ('legacy-employee');
      INSERT INTO "Leave" VALUES ('legacy-leave');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010150000_add_sst_certificates/migration.sql", "utf8"));
    assert.deepEqual((await db.query('SELECT id FROM "Leave"')).rows, [{ id: "legacy-leave" }]);
    await assert.rejects(db.exec(`INSERT INTO "SstAccessGrant" (id, "usuarioId", "budgetUnitId", "updatedAt") VALUES ('g', 'unknown', 'unknown', now())`), /foreign key/);
    await db.exec(`INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Person" VALUES ('doctor');
      INSERT INTO "SstCertificateReason" (id, "budgetUnitId", code, name, "updatedAt") VALUES ('reason', 'ug', 'MED', 'Médico', now());`);
    await assert.rejects(db.exec(`INSERT INTO "SstMedicalCertificate" (id, "budgetUnitId", "employeeId", "reasonId", "issuerPersonId", "issuerCouncil", "startsAt", "endsAt", "presentedAt", "protocolNumber", "createdById", "updatedAt") VALUES ('c', 'ug', 'legacy-employee', 'reason', 'doctor', 'CRM', '2026-10-02', '2026-10-01', now(), 'SST-1', 'user', now())`), /check constraint/);
  } finally { await db.close(); }
});
