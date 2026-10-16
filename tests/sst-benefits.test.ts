import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beneficiaryInput, benefitEntryInput, benefitMoney, benefitDay, benefitCompetence, summarizeBenefitLedger, ExactDecimal } from "../src/lib/sst/benefit-policy";
import { buildBenefitCandidate, reconcileBenefitAmounts } from "../src/lib/sst/benefit-integration";
import { benefitFiscalReadiness } from "../src/lib/sst/benefit-fiscal";

test("exact amounts reject precision loss and individual signed ledgers reconcile", () => {
  assert.equal(benefitMoney.parse("0,10"), "0.10");
  for (const input of [0.1, "1.001", "1e3", "-1", "Infinity", "", "1.000,00"]) assert.equal(benefitMoney.safeParse(input).success, false);
  const row = (beneficiaryId: string, kind: string, amount: string, competence = "10/2026") => ({ beneficiaryId, kind, amount: new ExactDecimal(amount), competence });
  const rows = summarizeBenefitLedger([row("titular", "MONTHLY", "0.10"), row("titular", "EXTRAORDINARY", "0.20"), row("titular", "REFUND", "-0.10"), row("dep", "MONTHLY", "150.22"), row("dep", "REFUND", "-50.22", "11/2026")]);
  assert.deepEqual(rows[0], { beneficiaryId: "titular", competence: "10/2026", monthly: "0.10", extraordinary: "0.20", refunds: "0.10", net: "0.20" });
  assert.equal(rows[1].net, "150.22"); assert.equal(rows[2].net, "-50.22");
});
test("civil dates, canonical competence and admission periods are validated", () => {
  assert.equal(benefitDay.safeParse("2026-02-29").success, false);
  assert.equal(benefitDay.parse("2024-02-29").toISOString().slice(0, 10), "2024-02-29");
  for (const value of ["2026-10", "13/2026", "1/2026"]) assert.equal(benefitCompetence.safeParse(value).success, false);
  const base = { planId: "p", payrollBenefitId: "pb", admissionDate: "2026-10-01", startsAt: "2026-10-01", endsAt: "2026-12-31", cardNumber: "123", monthlyAmount: "100", contractReference: "Termo 1" };
  assert.equal(beneficiaryInput.safeParse(base).success, true);
  assert.equal(beneficiaryInput.safeParse({ ...base, admissionDate: "2026-11-01" }).success, false);
  assert.equal(beneficiaryInput.safeParse({ ...base, endsAt: "2026-09-30" }).success, false);
  assert.equal(benefitEntryInput.safeParse({ beneficiaryId: "b", competence: "10/2026", kind: "REFUND", amount: "10", reason: "Devolução", sourceReference: "invoice" }).success, false);
});
test("candidate mapping is explicit and never financially posts despite production configuration", () => {
  const rubric = { id: "canonical-rubric", type: "DESCONTO", isActive: true, ruleSet: { status: "ATIVA", scope: "PRODUCAO", isDemo: false, approvedAt: new Date("2026-01-01"), effectiveFrom: new Date("2026-01-01"), effectiveUntil: null } };
  const base = { employeeId: "e", dependentId: "d", payrollBenefitId: "pb", competence: "10/2026", kind: "EXTRAORDINARY" as const, amount: "75.10", rubric, eventId: "canonical-event" };
  const candidate = buildBenefitCandidate(base);
  assert.equal(candidate.status, "CANDIDATE_ONLY"); assert.equal(candidate.rubricId, "canonical-rubric"); assert.equal(candidate.dependentId, "d");
  assert.deepEqual(candidate.blockers, ["POSTING_REQUIRES_VALIDATED_FUNCTIONAL_HISTORY"]);
  const refund = buildBenefitCandidate({ ...base, kind: "REFUND", chargeKind: "MONTHLY", amount: "-75.10", eventId: null, rubric: { ...rubric, ruleSet: { ...rubric.ruleSet, isDemo: true, effectiveUntil: new Date("2026-09-30") } } });
  assert.equal(refund.category, "MONTHLY"); assert.equal(refund.signedAmount, "-75.10");
  for (const issue of ["REFUND_POSTING_MAPPING_REQUIRED", "PAYROLL_EVENT_MAPPING_MISSING", "PRODUCTION_RULE_SET_NOT_APPROVED", "RULE_SET_OUTSIDE_COMPETENCE"]) assert.ok(refund.blockers.includes(issue));
});
test("equal Float payroll totals remain unconfirmed, and closed competence is never postable", () => {
  const result = reconcileBenefitAmounts("100.10", [{ id: "i", value: 100.1, payrollStatus: "Paga" }], false);
  assert.equal(result.difference, "0.00"); assert.equal(result.status, "UNCONFIRMED");
  assert.ok(result.issues.includes("BENEFICIARY_ALLOCATION_UNAVAILABLE")); assert.ok(result.issues.includes("CLOSED_COMPETENCE_NO_POSTING"));
  const invalid = reconcileBenefitAmounts("0.30", [{ id: "i", value: 0.1 + 0.2, payrollStatus: "Fechada" }], true);
  for (const issue of ["LEGACY_FLOAT_PRECISION_UNSUPPORTED", "AMOUNT_MISMATCH", "PAYROLL_NOT_PAID", "EVENT_MAPPING_AMBIGUOUS"]) assert.ok(invalid.issues.includes(issue));
});
test("fiscal years never reuse an unverified layout or presume payments", () => {
  const legacy = benefitFiscalReadiness(2024);
  assert.equal(legacy.exercise, 2025); assert.ok(legacy.layoutReference?.includes("141589")); assert.equal(legacy.officialOutputAvailable, false);
  const current = benefitFiscalReadiness(2026);
  assert.equal(current.layoutReference, null); assert.ok(current.blockers.includes("YEAR_SPECIFIC_LAYOUT_NOT_VERIFIED_DO_NOT_REUSE_DIRF_2025"));
  assert.equal(current.reportingRegime, "ESOCIAL_EFD_REINF");
  assert.equal(benefitFiscalReadiness(2025).reportingRegime, "ESOCIAL_EFD_REINF");
  assert.equal(legacy.reportingRegime, "DIRF_LEGACY_YEAR_SPECIFIC");
});

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "BenefitConfig" (id TEXT PRIMARY KEY,"supplierId" TEXT);
    CREATE TABLE "Company" (id TEXT PRIMARY KEY); CREATE TABLE "Supplier" (id TEXT PRIMARY KEY,"companyId" TEXT);
    CREATE TABLE "HrPayrollRubric" (id TEXT PRIMARY KEY); CREATE TABLE "PayrollEvent" (id TEXT PRIMARY KEY);
    CREATE TABLE "PayrollBenefit" (id TEXT PRIMARY KEY,"employeeId" TEXT,"benefitConfigId" TEXT);
    CREATE TABLE "Dependent" (id TEXT PRIMARY KEY,"employeeId" TEXT);
    INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "BenefitConfig" VALUES ('config','supplier');
    INSERT INTO "Company" VALUES ('operator'); INSERT INTO "Supplier" VALUES ('supplier','operator');
    INSERT INTO "HrPayrollRubric" VALUES ('monthly'),('extra'); INSERT INTO "PayrollEvent" VALUES ('monthly-event'),('extra-event');
    INSERT INTO "PayrollBenefit" VALUES ('pb','e','config'),('pb-duplicate','e','config'),('other-pb','other','config');
    INSERT INTO "Dependent" VALUES ('d','e'),('foreign-d','other');`);
  await db.exec(readFileSync("prisma/migrations-ibema/20261011050000_add_sst_health_benefits/migration.sql", "utf8"));
  await db.exec(`INSERT INTO "SstHealthPlan" (id,"budgetUnitId","benefitConfigId","supplierId","operatorCompanyId","ansPlanNumber","ansOperatorNumber","monthlyRubricId","extraordinaryRubricId","contractReference",snapshot,"createdById") VALUES ('plan','ug','config','supplier','operator','123456789','123456','monthly','extra','Contrato','{}','u');`);
  return db;
}
const coverage = (id: string, pb: string, dependent: string | null, from = "2026-10-01", to = "2026-12-31") => `INSERT INTO "SstBenefitBeneficiary" (id,"planId","payrollBenefitId","dependentId","beneficiaryKey","admissionDate","startsAt","endsAt","cardNumber","monthlyAmount","contractReference",snapshot,"createdById") VALUES ('${id}','plan','${pb}',${dependent ? `'${dependent}'` : "NULL"},'${dependent ?? "TITULAR"}','2026-10-01','${from}','${to}','card-${id}',100.10,'Termo','{}','u')`;
const entry = (id: string, beneficiary: string, kind: string, amount: string, competence = "10/2026", refund: string | null = null) => `INSERT INTO "SstBenefitEntry" (id,"beneficiaryId",competence,kind,amount,"sourceReference",reason,"refundOfId","requestHash","candidateSnapshot","createdById") VALUES ('${id}','${beneficiary}','${competence}','${kind}',${amount},'source-${id}','Lançamento',${refund ? `'${refund}'` : "NULL"},'hash','{}','u')`;
test("SQL enforces dependent ownership, overlap across duplicate RH assignments and immutable identity", async () => {
  const db = await database();
  try {
    await db.exec(coverage("titular", "pb", null)); await db.exec(coverage("dep", "pb", "d"));
    await assert.rejects(db.exec(coverage("foreign", "pb", "foreign-d")), /does not belong/);
    await assert.rejects(db.exec(coverage("overlap", "pb-duplicate", null)), /overlap/);
    await db.exec(coverage("next", "pb", null, "2027-01-01", "2027-12-31"));
    await assert.rejects(db.exec(`UPDATE "Dependent" SET "employeeId"='other' WHERE id='d'`), /identity used/);
    await assert.rejects(db.exec(`UPDATE "PayrollBenefit" SET "employeeId"='other' WHERE id='pb'`), /identity used/);
    await assert.rejects(db.exec(`UPDATE "SstBenefitBeneficiary" SET "cardNumber"='new' WHERE id='dep'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "PayrollBenefit" WHERE id='pb'`), /foreign key/);
    await assert.rejects(db.exec(`DELETE FROM "Company" WHERE id='operator'`), /foreign key/);
    await assert.rejects(db.exec(`UPDATE "Supplier" SET "companyId"='another' WHERE id='supplier'`), /operator identity used/);
  } finally { await db.close(); }
});
test("SQL ledger separates beneficiaries, limits refunds cumulatively and protects monthly competence", async () => {
  const db = await database();
  try {
    await db.exec(coverage("titular", "pb", null)); await db.exec(coverage("dep", "pb", "d"));
    await db.exec(entry("charge", "titular", "MONTHLY", "100.10")); await db.exec(entry("dep-charge", "dep", "MONTHLY", "100.10"));
    await assert.rejects(db.exec(entry("repeat-month", "titular", "MONTHLY", "100.10")), /unique constraint/);
    await assert.rejects(db.exec(entry("invalid-value", "titular", "MONTHLY", "99.99", "11/2026")), /differs from contract/);
    await assert.rejects(db.exec(entry("outside", "titular", "EXTRAORDINARY", "50", "01/2027")), /outside beneficiary coverage/);
    await assert.rejects(db.exec(entry("cross-refund", "dep", "REFUND", "-1", "10/2026", "charge")), /Invalid refund origin/);
    await assert.rejects(db.exec(entry("early-refund", "titular", "REFUND", "-1", "09/2026", "charge")), /precedes charge/);
    await db.exec(entry("refund", "titular", "REFUND", "-40.10", "11/2026", "charge"));
    await db.exec(entry("refund-after-coverage", "titular", "REFUND", "-60", "01/2027", "charge"));
    await assert.rejects(db.exec(entry("excess", "titular", "REFUND", "-0.01", "01/2027", "charge")), /exceeds original charge/);
    await assert.rejects(db.exec(`UPDATE "SstBenefitEntry" SET amount=1 WHERE id='charge'`), /immutable/);
    const result = await db.query<{ total: string }>(`SELECT SUM(amount)::text AS total FROM "SstBenefitEntry" WHERE "beneficiaryId"='titular'`);
    assert.equal(result.rows[0].total, "0.00");
  } finally { await db.close(); }
});
test("partial monthly coverage cannot create an invented pro rata charge", async () => {
  const db = await database();
  try {
    await db.exec(coverage("partial", "pb", null, "2026-10-15", "2026-12-31"));
    await assert.rejects(db.exec(entry("partial-month", "partial", "MONTHLY", "100.10")), /Partial month/);
    await db.exec(entry("valid-month", "partial", "MONTHLY", "100.10", "11/2026"));
    await db.exec(entry("valid-expense", "partial", "EXTRAORDINARY", "10.20"));
  } finally { await db.close(); }
});
