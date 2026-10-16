import assert from "node:assert/strict";
import test from "node:test";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { ExactDecimal } from "../src/lib/sst/benefit-policy";
import { generateBenefitMonthly, registerBenefitEntry } from "../src/lib/sst/benefit-service";
import { readBenefitStatement, listBenefitBeneficiaries } from "../src/lib/sst/benefit-query";

function fixture() {
  const writes: Record<string, unknown>[] = [];
  const user = { id: "u", employeeId: "employee", profileCode: "TEST", permissions: JSON.stringify({ modules: { SST: { create: true } } }), modulePermissions: [], allowedBudgetUnitIds: ["ug"] };
  const rubric = { id: "r", type: "DESCONTO", isActive: true, ruleSet: { status: "ATIVA", scope: "PRODUCAO", isDemo: false, approvedAt: new Date("2026-01-01"), effectiveFrom: new Date("2026-01-01"), effectiveUntil: null } };
  const beneficiary = { id: "b", planId: "p", payrollBenefitId: "pb", dependentId: "d", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-12-31"), monthlyAmount: new ExactDecimal("100.10"), payrollBenefit: { employeeId: "employee", employee: { secretariatId: "secretariat" } }, plan: { budgetUnitId: "ug", budgetUnit: { secretariatId: "secretariat" }, monthlyRubric: rubric, extraordinaryRubric: { ...rubric, id: "extra" }, monthlyEventId: "event", extraordinaryEventId: null } };
  let persisted: { id: string; requestHash: string } | null = null;
  const tx = {
    $executeRaw: async () => 0,
    sstBenefitBeneficiary: { findUniqueOrThrow: async () => beneficiary },
    sstBenefitEntry: { findUnique: async () => persisted, count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); persisted = { id: "entry", requestHash: String(data.requestHash) }; return persisted; } },
    auditEvent: { create: async () => ({ id: "audit" }) },
    // Any attempt to financially post from this integration is a test failure.
    payrollItem: { create: async () => { throw new Error("Unexpected financial posting"); }, createMany: async () => { throw new Error("Unexpected financial posting"); } },
  };
  const context = { user, prisma: { ...tx, $transaction: async (operation: (db: typeof tx) => unknown) => operation(tx) } } as unknown as AppContext;
  return { context, user, writes, beneficiary };
}
test("monthly generation is idempotent, typed, auditable and does not post PayrollItems", async () => {
  const { context, writes } = fixture();
  assert.equal(await generateBenefitMonthly(context, "b", "10/2026"), "entry");
  assert.equal(await generateBenefitMonthly(context, "b", "10/2026"), "entry");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].amount, "100.10");
  assert.deepEqual((writes[0].candidateSnapshot as { blockers: string[] }).blockers, ["POSTING_REQUIRES_VALIDATED_FUNCTIONAL_HISTORY"]);
  assert.equal((writes[0].candidateSnapshot as { dependentId: string }).dependentId, "d");
  await assert.rejects(registerBenefitEntry(context, { beneficiaryId: "b", competence: "10/2026", kind: "MONTHLY", amount: "100.10", sourceReference: "MONTHLY:10/2026", reason: "Changed reason" }), /outros dados/);
});
test("financial ledger creation denies read-only and cross-UG users before writes", async () => {
  const readOnly = fixture(); readOnly.user.permissions = JSON.stringify({ modules: { SST: { create: false } } });
  await assert.rejects(generateBenefitMonthly(readOnly.context, "b", "10/2026"), /perfil não permite/);
  assert.equal(readOnly.writes.length, 0);
  const cross = fixture(); cross.user.allowedBudgetUnitIds = ["other"];
  await assert.rejects(generateBenefitMonthly(cross.context, "b", "10/2026"), /Acesso negado/);
  assert.equal(cross.writes.length, 0);
  const partial = fixture(); partial.beneficiary.startsAt = new Date("2026-10-15");
  await assert.rejects(generateBenefitMonthly(partial.context, "b", "10/2026"), /Cobertura parcial/);
});
test("portal detail and paginated list derive ownership exclusively from session", async () => {
  const calls: { where: unknown; take?: number; skip?: number }[] = [];
  const context = { user: { employeeId: "session-employee" }, prisma: { sstBenefitBeneficiary: {
    findFirst: async (query: { where: unknown }) => { calls.push(query); return null; },
    count: async (query: { where: unknown }) => { calls.push(query); return 45; },
    findMany: async (query: { where: unknown; take: number; skip: number }) => { calls.push(query); return []; },
  } } } as unknown as AppContext;
  assert.equal(await readBenefitStatement(context, "foreign-id", { from: "01/2026", to: "12/2026" }, true), null);
  assert.deepEqual(calls[0].where, { id: "foreign-id", payrollBenefit: { employeeId: "session-employee" } });
  const result = await listBenefitBeneficiaries(context, { page: "999" }, true);
  assert.equal(result.page, 3); assert.equal(calls[2].take, 20); assert.equal(calls[2].skip, 40);
  assert.deepEqual(calls[2].where, { payrollBenefit: { employeeId: "session-employee" } });
});
