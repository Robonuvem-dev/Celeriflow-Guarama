import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { absenceMinutes, assertCertificateReason, certificateInput } from "../src/lib/sst/certificate-policy";
import { assertSstClinicalAccess } from "../src/lib/sst/access";
import { assessCertificate, registerCertificate } from "../src/lib/sst/certificate-service";
import type { AppContext } from "../src/lib/platform/tenant-context";

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
  const context = { user: operator, prisma: { sstAccessGrant: { findUnique: async () => null } } } as unknown as AppContext;
  await assert.rejects(assertSstClinicalAccess(context, "ug"), /clínica/);
  await assert.rejects(assertSstClinicalAccess(context, "other"), /Unidade Gestora/);
  const reader = { user: operator, prisma: { sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess: false }) } } } as unknown as AppContext;
  await assertSstClinicalAccess(reader, "ug");
  await assert.rejects(assertSstClinicalAccess(reader, "ug", true), /clínica/);
});

test("assessment atomically claims state and cannot generate a second leave", async () => {
  let claims = 0; let leaves = 0; let assessments = 0;
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async (sql: TemplateStringsArray) => String(sql).includes("SstCertificateFunctionalSource") ? [{ snapshot: { id: "period", employeeId: "employee", budgetUnitId: "ug", governmentEntityId: "entity", employmentRegimeId: "regime", roleId: "historical-role", departmentId: "historical-department", localId: "local", costCenterId: "center", startsAt: "2026-01-01T00:00:00Z", endsAt: "2027-01-01T00:00:00Z" } }] : [],
    sstMedicalCertificate: {
      updateMany: async () => ({ count: claims++ === 0 ? 1 : 0 }),
      findUniqueOrThrow: async () => ({ id: "certificate", employeeId: "employee", budgetUnitId: "ug", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-02"), protocolNumber: "SST-1", reason: { createLeaveOnApproval: true, leaveType: "Licença médica" } }),
      update: async () => ({}),
    },
    person: { findUnique: async () => ({ id: "doctor" }) },
    configuracaoModulo: { findUnique: async () => ({ ativo: true }) },
    leave: { findFirst: async () => null, create: async () => { leaves++; return { id: "leave" }; } },
    sstMedicalAssessment: { create: async () => { assessments++; return {}; } },
    auditEvent: { create: async () => ({}) },
  };
  const context = {
    user: { ...operator, profileCode: "ADMIN_TECNICO" },
    prisma: { sstMedicalCertificate: { findUnique: async () => ({ budgetUnitId: "ug" }) }, sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess: true }) }, $transaction: async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx) },
  } as unknown as AppContext;
  // Grant RH create via profile rather than relying on a technical-admin code.
  context.user.permissions = JSON.stringify({ modules: { RH: { blocked: false, create: true } } });
  const input = { certificateId: "certificate", examinerPersonId: "doctor", examinerCouncil: "CRM PR 123", decision: "APPROVED", opinion: "Afastamento deferido após avaliação.", assessedAt: "2026-10-03" };
  await assessCertificate(context, input);
  await assert.rejects(assessCertificate(context, input), /já possui uma decisão/);
  assert.equal(leaves, 1); assert.equal(assessments, 1);
});

test("retry of certificate submission reuses the original protocol without duplicating the record", async () => {
  const input = { budgetUnitId: "ug", employeeId: "employee", reasonId: "reason", issuerPersonId: "doctor", issuerCouncil: "CRM PR 123", startsAt: new Date("2026-10-01T08:00Z"), endsAt: new Date("2026-10-01T12:00Z"), submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
  let creates = 0;
  const tx = {
    $executeRaw: async () => 1,
    budgetUnit: { findUnique: async () => ({ id: "ug", secretariatId: "s" }) },
    employee: { findUnique: async () => ({ id: "employee", secretariatId: "s", isActive: true, roleId: null }) },
    sstCertificateReason: { findUnique: async () => ({ id: "reason", budgetUnitId: "ug", isActive: true, autoProtocol: true, autoPresentedAt: true, dependentPolicy: "DISABLED", restrictedRoleIds: [], printReceipt: false, suggestLeave: false }) },
    person: { findUnique: async () => ({ id: "doctor" }) },
    sstMedicalCertificate: { findUnique: async () => ({ ...input, id: "original", createdById: "user", cidCodes: [], dependentId: null, processId: null }), create: async () => { creates++; return {}; } },
  };
  const context = { user: operator, prisma: { sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true }) }, $transaction: async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx) } } as unknown as AppContext;
  assert.equal((await registerCertificate(context, input)).id, "original");
  assert.equal(creates, 0);
  await assert.rejects(registerCertificate(context, { ...input, endsAt: new Date("2026-10-01T14:00Z") }), /protocolo já foi utilizado/);
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
