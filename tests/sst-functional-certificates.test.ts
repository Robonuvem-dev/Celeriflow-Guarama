import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { certificateFunctionalSource, assertCertificatePayrollReconciliation, reviseCertificateDecision } from "../src/lib/sst/functional-certificate-service";
import { listCertificatesWithFunctionalFilters } from "../src/lib/sst/functional-certificate-list";
import { getAuthorizedHistoricalExposure } from "../src/lib/sst/functional-service";

test("certificate regimes use historical employee period, never current cargo or secretariat inference", async () => {
  const input = { employeeId: "e", budgetUnitId: "ug", reasonId: "reason", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-02") };
  let queries = 0;
  const tx = { $executeRaw: async () => 1, $queryRaw: async () => ++queries === 1 ? [{ id: "period", roleId: "historical-role", employmentRegimeId: "regime" }] : [{ id: "policy", restrictedRegimeIds: ["regime"] }] } as unknown as Prisma.TransactionClient;
  await assert.rejects(certificateFunctionalSource(tx, input), /regime contratual/);
  const missing = { $executeRaw: async () => 1, $queryRaw: async () => [] } as unknown as Prisma.TransactionClient;
  await assert.rejects(certificateFunctionalSource(missing, input), /período funcional RH explícito/);
});
test("closed or computed payroll blocks reversal; no entries reports pending canonical origin", async () => {
  const start = new Date("2026-11-01T01:00:00Z"); // still October in occupational timezone
  const end = new Date("2026-11-01T03:00:00Z");
  const tx = (status: string, competence = "10/2026") => ({ $executeRaw: async () => 1, payrollItem: { findMany: async () => [{ id: "item", payroll: { id: "payroll", status, competence } }] } }) as unknown as Prisma.TransactionClient;
  await assert.rejects(assertCertificatePayrollReconciliation(tx("Fechada"), "e", start, end), /fechada\/paga/);
  await assert.rejects(assertCertificatePayrollReconciliation(tx("Aberta"), "e", start, end), /origem canônica/);
  await assert.rejects(assertCertificatePayrollReconciliation(tx("Paga", "unknown"), "e", start, end), /formato canônico/);
  const empty = { $executeRaw: async () => 1, payrollItem: { findMany: async () => [] } } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await assertCertificatePayrollReconciliation(empty, "e", start, end), { status: "PENDING_CANONICAL_PAYROLL_ORIGIN", source: "SST_CERTIFICATE_DECISION", financialEntriesCreated: false, paymentStatus: "NOT_VERIFIED" });
});
test("administrative historical filters authorize UG before count or listing", async () => {
  let queries = 0;
  const context = { user: { profileCode: "SST", permissions: JSON.stringify({ modules: { SST: { blocked: false } } }), modulePermissions: [], allowedBudgetUnitIds: ["ug"] }, prisma: { $queryRaw: async () => { queries++; return []; } } } as unknown as AppContext;
  await assert.rejects(listCertificatesWithFunctionalFilters(context, { budgetUnitId: "foreign", employmentRegimeId: "regime" }), /Unidade Gestora/);
  assert.equal(queries, 0);
});
test("PPP source exposes gaps and overlapping programme versions instead of guessing one", async () => {
  const history = { id: "period", employeeId: "e", budgetUnitId: "ug", startsAt: new Date("2026-10-02"), endsAt: new Date("2026-10-03"), departmentId: "historical-dept", roleId: "historical-cargo", functionRoleId: "other-function" };
  const group = { groupId: "g", groupSnapshot: { departmentIds: ["historical-dept"], roleIds: ["historical-cargo"], startsAt: "2026-10-01", endsAt: "2026-11-01" }, risks: [{ description: "Ruído" }] };
  let queries = 0;
  const context = { user: { id: "user", profileCode: "SYSTEM_ADMINISTRATOR" }, prisma: {
    $queryRaw: async () => ++queries === 1 ? [history] : [],
    sstProgramExposureGroup: { findMany: async () => [1, 2].map((version) => ({ ...group, id: `group${version}`, programId: `program${version}`, program: { version, kind: "LTCAT", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-11-01") } })) },
    auditEvent: { create: async () => ({}) },
  } } as unknown as AppContext;
  const result = await getAuthorizedHistoricalExposure(context, "e", "ug", new Date("2026-10-01"), new Date("2026-10-04"));
  assert.equal(result.exposure.length, 2);
  assert.deepEqual(result.blockers, ["FUNCTIONAL_HISTORY_GAP", "OVERLAPPING_PROGRAM_VERSIONS"]);
  assert.equal(result.source, "HR_EMPLOYEE_FUNCTIONAL_HISTORY");
});
test("rectification rejects stale revision and closed payroll before changing Leave or decision", async () => {
  let changes = 0;
  let latest: { id: string; revision: number }[] = [];
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => String(sql).includes("SstCertificateDecisionRevision") ? latest : [],
    $executeRaw: async () => 1,
    sstMedicalCertificate: { findUniqueOrThrow: async () => ({ id: "cert", budgetUnitId: "ug", employeeId: "e", status: "APPROVED", leaveId: "leave", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-02"), reason: { createLeaveOnApproval: true, leaveType: "Licença médica" } }), update: async () => { changes++; } },
    person: { findUnique: async () => ({ id: "doctor" }) },
    payrollItem: { findMany: async () => [{ id: "item", payroll: { id: "payroll", competence: "10/2026", status: "Fechada" } }] },
    leave: { update: async () => { changes++; } },
  };
  const context = { user: { id: "user", profileCode: "SYSTEM_ADMINISTRATOR", allowedBudgetUnitIds: [] }, prisma: { sstMedicalCertificate: { findUnique: async () => ({ budgetUnitId: "ug" }) }, $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) } } as unknown as AppContext;
  const input = { certificateId: "cert", decision: "REVOKED", expectedStatus: "APPROVED", reason: "Revogação justificada", examinerPersonId: "doctor", examinerCouncil: "CRM PR 123" };
  await assert.rejects(reviseCertificateDecision(context, input), /fechada\/paga/);
  latest = [{ id: "newer", revision: 1 }];
  await assert.rejects(reviseCertificateDecision(context, input), /outra operação/);
  assert.equal(changes, 0);
});
