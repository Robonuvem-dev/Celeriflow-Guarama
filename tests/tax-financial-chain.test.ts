import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { createTaxChainDatabase } from "./helpers/tax-chain-database";
import { taxAssessments, taxGuides, taxes } from "../src/db/schema/taxation-core";
import { taxPayments, taxActiveDebts, taxDebtInstallments, taxIntegrationEvents } from "../src/db/schema/tax-accounting";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxpayers } from "../src/db/schema/registry";
import { accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { catalogParameters } from "../src/db/schema/tax-catalog-rules";
import { revenues, revenueReversals, taxRevenueIntegrations } from "../src/db/schema/finance-revenues";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { financialYears } from "../src/db/schema/finance-years";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { executionBenefitGrants } from "../src/db/schema/planning-execution-operations";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { confirmTaxPayment, configureTaxFinancialMapping, createTaxAssessment, generateTaxGuide, enrollAssessmentInActiveDebt, createDebtInstallmentPlan } from "../src/lib/tributacao";
import { getBankAccountBalance } from "../src/lib/financeiro";
import { applyTaxCredit, approveRefundRequest, createParametrizedAssessment, generateGroupedTaxGuides, generatePartialTaxGuide, getAssessmentAccount, processCollectionReturn, registerCreditEvent, reviseTaxAssessment } from "../src/lib/tributacao/s2-service";
import { executeTaxRefund } from "../src/lib/tributacao/credit-finance";
import { reverseTaxPayment } from "../src/lib/tributacao/payment-reversal";
import { reverseTaxCreditMovement } from "../src/lib/tributacao/credit-reversal";
import { taxAssessmentAccessFilter } from "../src/lib/tributacao/scope";
import { createBenefitRule, grantBenefit } from "../src/lib/tributacao/s8-service";
import { readPlanningWaiverRealization } from "../src/lib/planejamento/fiscal-execution";

function databaseFailure(pattern: RegExp) {
  return (error: unknown): boolean => error instanceof Error && (pattern.test(error.message) || databaseFailure(pattern)(error.cause));
}

async function createChainFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE") {
  const local = await createTaxChainDatabase(jurisdiction);
  try {
    const store = local.connection.db;
    const n = async (table: PgTable, where?: SQL) => (await store.select({ value: count() }).from(table).where(where))[0].value;
    const registry = async (where: SQL) => (await store.select().from(taxRegistryEntries).where(where).limit(1))[0];
    const actor = { ...local.actor, allowedBudgetUnitIds: ["ug"] };
    const context = local.context;
    return { ...local, db: local.connection, store, pg: local.database, actor, context, n, registry };
  } catch (error) { await local.close(); throw error; }
}
type Fixture = Awaited<ReturnType<typeof createChainFixture>>;
async function scenario(body: (fixture: Fixture) => Promise<void>, jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    fixture = await createChainFixture(jurisdiction);
    await fixture.store.insert(taxes).values({ id: "tax-chain", name: "Tributo de ensaio", taxType: "Taxa", isActive: true });
    await fixture.store.insert(taxpayers).values({ id: "taxpayer-chain", taxpayerType: "PJ", companyId: "empresa", status: "Ativo" });
    await configureTaxFinancialMapping(fixture.db, fixture.actor, { taxId: "tax-chain", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    await body(fixture);
  } finally {
    await fixture?.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
}

test("P1: motor parametrizado preserva ente/UG e valida escopo e conteúdo também no replay", async () => scenario(async (f) => {
  await f.store.insert(catalogParameters).values({ id: "parameter-chain", taxId: "tax-chain", code: "POC", name: "Regra de ensaio", calculationType: "PERCENTUAL_BASE", configuration: { formula: "PERCENTUAL_BASE", rate: 4 }, effectiveFrom: new Date("2026-01-01"), isActive: true });
  const input = { taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", competence: new Date("2026-03-01"), originKey: "chain-assessment" };
  await assert.rejects(createParametrizedAssessment(f.db, f.actor, input), /sem origem conciliada/);
  await f.store.insert(taxRegistryEntries).values({ entityType: "TAX_PARAMETER", entityId: "parameter-chain", category: "PARAMETER_SCOPE", title: "Origem conferida da regra", data: { governmentEntityId: "ente", budgetUnitId: "ug" } });
  const assessment = await createParametrizedAssessment(f.db, f.actor, input);
  assert.equal(taxScopeSnapshot(assessment.calculationSnapshot).financialYearId, "ano");
  assert.equal(taxScopeSnapshot(assessment.calculationSnapshot).governmentEntityId, "ente");
  assert.equal(taxScopeSnapshot(assessment.calculationSnapshot).budgetUnitId, "ug");
  assert.equal((await f.store.select({ value: count() }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).where(taxAssessmentAccessFilter(["ug-restrita"])))[0].value, 0);
  assert.equal(await f.n(taxAssessments, taxAssessmentAccessFilter(["ug"])), 1);
  assert.equal(await f.n(taxAssessments, taxAssessmentAccessFilter([])), 0);
  assert.equal((await createParametrizedAssessment(f.db, f.actor, input)).id, assessment.id);
  await assert.rejects(createParametrizedAssessment(f.db, f.actor, { ...input, taxableBase: "200.00" }), /outros dados/i);
  const other = { ...f.actor, allowedBudgetUnitIds: ["ug-restrita"] };
  await assert.rejects(createParametrizedAssessment(f.db, other, input), /autorizadas/i);
  await assert.rejects(generatePartialTaxGuide(f.db, other, { assessmentId: assessment.id, amount: "2.00", dueDate: new Date("2026-03-31") }), /autorizadas/i);
  const eventInput = { assessmentId: assessment.id, eventType: "IMPUGNACAO" as const, reason: "Ensaio", idempotencyKey: "chain-event" };
  const event = await registerCreditEvent(f.db, f.actor, eventInput);
  assert.equal((await registerCreditEvent(f.db, f.actor, eventInput)).id, event.id);
  await assert.rejects(registerCreditEvent(f.db, other, eventInput), /autorizadas/i);
  await assert.rejects(registerCreditEvent(f.db, f.actor, { ...eventInput, reason: "Outro motivo" }), /outros dados/i);
  await assert.rejects(configureTaxFinancialMapping(f.db, other, { taxId: "tax-chain", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" }), /autorizadas/i);
  await f.store.insert(catalogParameters).values({ id: "parameter-overlap", taxId: "tax-chain", code: "POC-OVERLAP", name: "Regra sobreposta", calculationType: "PERCENTUAL_BASE", configuration: { formula: "PERCENTUAL_BASE", rate: 8 }, effectiveFrom: new Date("2026-02-01"), isActive: true });
  await assert.rejects(createParametrizedAssessment(f.db, f.actor, { ...input, originKey: "overlapping-rule" }), /sobrepostas/i);
  assert.equal(await f.n(taxAssessments), 1);
}));

test("P2: débito de exercício encerrado é arrecadado no corrente sem reabrir a origem", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await f.store.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano"));
  await f.store.insert(financialYears).values({ id: "current-tax-year", year: 2027, governmentEntityId: "ente", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z"), status: "Aberto" });
  await f.store.insert(planningCatalogVersions).values({ id: "current-tax-catalog", year: 2027, label: "Contas municipais correntes", normativeReference: "Fixture de arrecadação no exercício corrente", sourceHash: "tax-chain-2027", createdById: f.actor.usuarioId, status: "DRAFT" });
  await f.store.insert(planningCatalogEntries).values(["debito", "credito"].map((id, index) => ({ versionId: "current-tax-catalog", kind: "ACCOUNT", degree: 7, code: `CHAIN.2027.${index + 1}`, name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: index ? "C" : "D", effectiveFrom: "2027-01-01", effectiveUntil: "2027-12-31" } })));
  await f.store.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "current-tax-catalog"));
  const input = { guideId: guide.id, amountPaid: "4.00", paymentDate: new Date("2027-02-01"), paymentMethod: "Manual", idempotencyKey: "historical-tax-payment" };
  await confirmTaxPayment(f.db, f.actor, input);
  assert.equal((await f.store.select().from(revenues).limit(1))[0].financialYearId, "current-tax-year");
  assert.equal((await f.store.select().from(reconciliationTreasuryMovements).limit(1))[0].financialYearId, "current-tax-year");
  assert.equal((await f.store.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id)))[0].year, 2026);
  assert.equal((await f.store.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Encerrado");
  assert.equal((await confirmTaxPayment(f.db, f.actor, input)).id, guide.id);
  await assert.rejects(confirmTaxPayment(f.db, f.actor, { ...input, amountPaid: "3.00" }), /outros dados/i);
  await assert.rejects(confirmTaxPayment(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  assert.equal(await f.n(revenues), 1);
}));

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P2: extinção reduz saldo e dívida uma única vez; revisão preserva decisão e escopo (${jurisdiction})`, async () => scenario(async (f) => {
    const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "10" });
    const input = { assessmentId: assessment.id, eventType: "EXTINCAO_NAO_FINANCEIRA" as const, amount: "3.00", reason: "Decisão administrativa fundamentada", idempotencyKey: "extinction-chain" };
    const entry = await registerCreditEvent(f.db, f.actor, input);
    assert.equal((await registerCreditEvent(f.db, f.actor, input)).id, entry.id);
    assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "7.00");
    await assert.rejects(registerCreditEvent(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
    await assert.rejects(registerCreditEvent(f.db, f.actor, { ...input, amount: "4.00" }), /outros dados/i);
    await assert.rejects(registerCreditEvent(f.db, f.actor, { ...input, amount: "8.00", idempotencyKey: "over-extinction" }), /saldo/i);
    await assert.rejects(registerCreditEvent(f.db, f.actor, { ...input, eventType: "COMPENSACAO", idempotencyKey: "unfunded-compensation" }), /crédito disponível/i);
    const revision = { assessmentId: assessment.id, imposedValue: "6.00", reason: "Revisão da decisão", idempotencyKey: "revision-chain" };
    const revised = await reviseTaxAssessment(f.db, f.actor, revision);
    assert.equal((await reviseTaxAssessment(f.db, f.actor, revision)).id, revised.id);
    await assert.rejects(reviseTaxAssessment(f.db, f.actor, { ...revision, imposedValue: "5.00" }), /outros dados/i);
    await assert.rejects(reviseTaxAssessment(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, revision), /autorizadas/i);
    const guide = await generatePartialTaxGuide(f.db, f.actor, { assessmentId: assessment.id, amount: "2.00", dueDate: new Date("2026-03-31") });
    await assert.rejects(registerCreditEvent(f.db, f.actor, { ...input, idempotencyKey: "extinction-with-guide" }), /guias abertas/i);
    await assert.rejects(reviseTaxAssessment(f.db, f.actor, { ...revision, idempotencyKey: "revision-with-guide" }), /guias abertas/i);
    await confirmTaxPayment(f.db, f.actor, { guideId: guide.id, amountPaid: "2.00", paymentDate: new Date("2026-03-01"), paymentMethod: "Manual", idempotencyKey: "extinction-paid" });
    await assert.rejects(reviseTaxAssessment(f.db, f.actor, { ...revision, imposedValue: "1.00", idempotencyKey: "below-paid" }), /pagamentos/i);
    assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "4.00");
    const debt = await enrollAssessmentInActiveDebt(f.db, f.actor, assessment.id);
    assert.equal(debt.originalValueDecimal!.toFixed(2), "4.00");
  }, jurisdiction));
}

test("P2: extinção integral é atômica, não cria caixa e respeita fechamento corrente", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "10" });
  const input = { assessmentId: assessment.id, eventType: "EXTINCAO_NAO_FINANCEIRA" as const, reason: "Extinção integral documentada no processo", idempotencyKey: "full-extinction" };
  await f.pg.exec(`CREATE FUNCTION fail_extinction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='CREDIT_EVENT' THEN RAISE EXCEPTION 'injected extinction failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_extinction BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_extinction();`);
  await assert.rejects(registerCreditEvent(f.db, f.actor, input), databaseFailure(/extinction failure/i));
  assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "10.00");
  assert.equal(await f.n(taxIntegrationEvents, eq(taxIntegrationEvents.idempotencyKey, "CREDIT_EVENT:full-extinction")), 0);
  await f.pg.exec('DROP TRIGGER fail_extinction ON "TaxRegistryEntry"; DROP FUNCTION fail_extinction();');
  await f.store.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano"));
  await assert.rejects(registerCreditEvent(f.db, f.actor, input), /exercício|aberto|vigente/i);
  await f.store.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
  const before = { revenue: await f.n(revenues), movement: await f.n(reconciliationTreasuryMovements), posting: await f.n(accountingTransactions) };
  const entry = await registerCreditEvent(f.db, f.actor, input);
  assert.equal(taxScopeSnapshot(entry.data).amount, "10.00");
  assert.equal((await registerCreditEvent(f.db, f.actor, input)).id, entry.id);
  assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "0.00");
  await assert.rejects(generatePartialTaxGuide(f.db, f.actor, { assessmentId: assessment.id, amount: "0.01", dueDate: new Date("2026-03-31") }), /disponível/i);
  await assert.rejects(generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") }), /disponível/i);
  assert.deepEqual({ revenue: await f.n(revenues), movement: await f.n(reconciliationTreasuryMovements), posting: await f.n(accountingTransactions) }, before);
}));

test("P2: suspensão recusa DAM integral, parcial e agrupado sem alterar outros débitos", async () => scenario(async (f) => {
  const a = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "10" });
  const b = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "200.00", rate: "10" });
  await registerCreditEvent(f.db, f.actor, { assessmentId: a.id, eventType: "SUSPENSAO", reason: "Suspensão de exigibilidade em processo administrativo", idempotencyKey: "suspended-assessment" });
  await assert.rejects(generateTaxGuide(f.db, f.actor, { assessmentId: a.id, dueDate: new Date("2026-03-31") }), /disponível/i);
  await assert.rejects(generatePartialTaxGuide(f.db, f.actor, { assessmentId: a.id, amount: "1.00", dueDate: new Date("2026-03-31") }), /disponível/i);
  await assert.rejects(generateGroupedTaxGuides(f.db, f.actor, { assessmentIds: [a.id, b.id], dueDate: new Date("2026-03-31") }), /disponível/i);
  assert.equal(await f.n(taxGuides), 0);
  assert.equal((await f.store.select().from(taxAssessments).where(eq(taxAssessments.id, a.id)))[0].status, "Suspenso");
  assert.equal((await getAssessmentAccount(f.store, b.id)).position.balance.toFixed(2), "20.00");
}));

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P2: benefício baixa débito atomicamente e alimenta renúncia realizada (${jurisdiction})`, async () => scenario(async (f) => {
    const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "10" });
    const rule = await createBenefitRule(f.db, f.actor, { code: "BENEFIT-CHAIN", name: "Benefício individual", benefitType: "RENUNCIA", legalReference: "Fundamento parametrizado para implantação", value: 30, valueMode: "PERCENT", effectiveFrom: new Date("2026-01-01") });
    const input = { ruleId: rule.id, taxpayerId: assessment.taxpayerId, sourceType: "TAX_ASSESSMENT", sourceId: assessment.id, originalAmount: 10, reason: "Concessão individual fundamentada" };
    await assert.rejects(grantBenefit(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
    await assert.rejects(grantBenefit(f.db, f.actor, { ...input, taxpayerId: "another-taxpayer" }), /titular/i);
    await assert.rejects(grantBenefit(f.db, f.actor, { ...input, originalAmount: 9 }), /saldo/i);
    await f.pg.exec(`CREATE FUNCTION fail_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source='BENEFICIO' THEN RAISE EXCEPTION 'injected benefit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_benefit BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_benefit();`);
    await assert.rejects(grantBenefit(f.db, f.actor, input), databaseFailure(/benefit failure/i));
    assert.equal(await f.n(executionBenefitGrants), 0);
    assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "10.00");
    await f.pg.exec('DROP TRIGGER fail_benefit ON "TaxRegistryEntry"; DROP FUNCTION fail_benefit();');
    const grant = await grantBenefit(f.db, f.actor, input);
    assert.equal(grant.renunciationDecimal.toFixed(2), "3.00");
    assert.equal((await getAssessmentAccount(f.store, assessment.id)).position.balance.toFixed(2), "7.00");
    assert.equal((await grantBenefit(f.db, f.actor, input)).id, grant.id);
    await assert.rejects(grantBenefit(f.db, f.actor, { ...input, reason: "Outra decisão" }), /outros dados/i);
    await assert.rejects(grantBenefit(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
    const realized = await readPlanningWaiverRealization(f.context, "ente", "tax-chain", 2026, new Date().toISOString().slice(0, 10));
    assert.equal(realized.status, "CONNECTED");
    assert.equal(realized.value, "3.00");
    assert.deepEqual(realized.originIds, [grant.id]);
    assert.equal(await f.n(revenues), 0);
    const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
    assert.equal(guide.totalValueDecimal!.toFixed(2), "7.00");
  }, jurisdiction));
}

test("P2: inscrição considera apenas saldo e parcelamento/replay preservam autorização", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "10" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await confirmTaxPayment(f.db, f.actor, { guideId: guide.id, amountPaid: "4.00", paymentDate: new Date("2026-03-01"), paymentMethod: "Manual", idempotencyKey: "partial-debt" });
  await assert.rejects(enrollAssessmentInActiveDebt(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, assessment.id), /autorizadas/i);
  const debt = await enrollAssessmentInActiveDebt(f.db, f.actor, assessment.id);
  assert.equal(debt.originalValueDecimal!.toFixed(2), "6.00");
  assert.equal((await enrollAssessmentInActiveDebt(f.db, f.actor, assessment.id)).id, debt.id);
  await assert.rejects(enrollAssessmentInActiveDebt(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, assessment.id), /autorizadas/i);
  const input = { activeDebtId: debt.id, installmentsCount: 4, firstDueDate: new Date("2026-04-01"), downPayment: "0.01" };
  await assert.rejects(createDebtInstallmentPlan(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  const plan = await createDebtInstallmentPlan(f.db, f.actor, input);
  const schedules = (await f.store.execute<{ valueDecimal: string }>(sql`SELECT "valueDecimal"::text FROM "DebtInstallmentSchedule" WHERE "debtInstallmentId"=${plan.id}`)).rows;
  assert.equal(schedules.reduce((sum, row) => sum.plus(new Decimal(row.valueDecimal)), new Decimal("0.01")).toFixed(2), "6.00");
  await assert.rejects(createDebtInstallmentPlan(f.db, f.actor, input), /parcelamento ativo/i);
  assert.equal(await f.n(taxActiveDebts), 1);
  assert.equal(await f.n(taxDebtInstallments), 1);
}));

test("P2: falha no crédito excedente reverte toda a baixa; retry e replay não duplicam a cadeia", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  const before = await f.n(accountingTransactions);
  await f.pg.exec(`CREATE FUNCTION fail_credit_p2() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='TAX_CREDIT' THEN RAISE EXCEPTION 'P2 injected credit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_credit_p2 BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_credit_p2();`);
  const input = { idempotencyKey: "atomic-return", guideNumber: guide.guideNumber!, amount: "5.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO" as const };
  await assert.rejects(processCollectionReturn(f.db, f.actor, input), databaseFailure(/injected credit failure/i));
  assert.equal(await f.n(taxPayments), 0);
  assert.equal(await f.n(revenues), 0);
  assert.equal(await f.n(reconciliationTreasuryMovements), 0);
  assert.equal(await f.n(taxRevenueIntegrations), 0);
  assert.equal(await f.n(accountingTransactions), before);
  assert.equal((await f.store.select().from(taxGuides).where(eq(taxGuides.id, guide.id)))[0].status, "Emitida");
  await f.pg.exec('DROP TRIGGER fail_credit_p2 ON "TaxRegistryEntry"');
  const returned = await processCollectionReturn(f.db, f.actor, input);
  assert.equal((await processCollectionReturn(f.db, f.actor, input)).id, returned.id);
  assert.equal(await f.n(taxPayments), 1);
  assert.equal(await f.n(revenues), 1);
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  assert.equal(taxScopeSnapshot(credit.data).available, "1.00");
  assert.equal(taxScopeSnapshot(credit.data).budgetUnitId, "ug");
  assert.equal((await getBankAccountBalance(f.store, "banco", new Date("2026-03-02"))).toFixed(2), "5.00");
  assert.equal(await f.n(accountingTransactions, eq(accountingTransactions.eventType, "TAX_COLLECTION_EXCESS")), 1);
  await assert.rejects(processCollectionReturn(f.db, f.actor, { ...input, amount: "6.00" }), /outros dados/i);
  await assert.rejects(processCollectionReturn(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  assert.equal(await f.n(taxRegistryEntries, eq(taxRegistryEntries.category, "TAX_CREDIT")), 1);
}));

test("P2: estorno da arrecadação e excedente é atômico, inverte partidas e reabre saldo sem apagar histórico", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { guideNumber: guide.guideNumber!, amount: "7.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO", idempotencyKey: "reversal-origin" });
  const [payment] = await f.store.select().from(taxPayments).limit(1);
  const input = { paymentId: payment.id, date: new Date("2026-03-02"), reason: "Retorno bancário incorreto", idempotencyKey: "reverse-origin" };
  await assert.rejects(reverseTaxPayment(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  await f.pg.exec(`CREATE FUNCTION fail_payment_reversal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='Estornado' THEN RAISE EXCEPTION 'injected reversal failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_payment_reversal BEFORE UPDATE ON "TaxPayment" FOR EACH ROW EXECUTE FUNCTION fail_payment_reversal();`);
  await assert.rejects(reverseTaxPayment(f.db, f.actor, input), databaseFailure(/injected reversal failure/i));
  assert.equal((await getBankAccountBalance(f.store, "banco", input.date)).toFixed(2), "7.00");
  assert.equal((await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"))).status, "DISPONIVEL");
  assert.equal(await f.n(revenueReversals), 0);
  await f.pg.exec(`DROP TRIGGER fail_payment_reversal ON "TaxPayment"; DROP FUNCTION fail_payment_reversal();`);
  const event = await reverseTaxPayment(f.db, f.actor, input);
  assert.equal((await reverseTaxPayment(f.db, f.actor, input)).id, event.id);
  await assert.rejects(reverseTaxPayment(f.db, f.actor, { ...input, reason: "Outro fundamento" }), /outros dados/i);
  assert.equal((await getBankAccountBalance(f.store, "banco", input.date)).toFixed(2), "0.00");
  assert.equal((await f.store.select().from(taxGuides).where(eq(taxGuides.id, guide.id)))[0].status, "Emitida");
  assert.equal((await f.store.select().from(taxPayments).where(eq(taxPayments.id, payment.id)))[0].status, "Estornado");
  assert.equal((await f.store.select().from(revenues).limit(1))[0].stage, "ESTORNADA");
  assert.equal((await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"))).status, "ESTORNADO");
  assert.equal(await f.n(accountingTransactions, isNotNull(accountingTransactions.reversalOfId)), 2);
  assert.equal(await f.n(revenues), 1);
  assert.equal(await f.n(revenueReversals), 1);
}));

test("P2: restituição paga reduz a obrigação e o caixa uma vez, com autorização e replay", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { idempotencyKey: "refund-ingress", guideNumber: guide.guideNumber!, amount: "6.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO" });
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  const requested = await applyTaxCredit(f.db, f.actor, { creditId: credit.id, operation: "RESTITUIR", amount: "2.00", reason: "Devolver excedente", idempotencyKey: "refund-request" });
  const requestId = String(taxScopeSnapshot(requested.result).movementId);
  await assert.rejects(approveRefundRequest(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, { requestId, approved: true, reason: "Aprovação" }), /autorizadas/i);
  await approveRefundRequest(f.db, f.actor, { requestId, approved: true, reason: "Aprovação" });
  const input = { requestId, bankAccountId: "banco", proofDocumentId: "documento-fiscal", date: new Date("2026-03-02"), idempotencyKey: "refund-paid" };
  const event = await executeTaxRefund(f.db, f.actor, input);
  assert.equal((await executeTaxRefund(f.db, f.actor, input)).id, event.id);
  await assert.rejects(executeTaxRefund(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  await assert.rejects(executeTaxRefund(f.db, f.actor, { ...input, date: new Date("2026-03-03") }), /outros dados/i);
  assert.equal((await getBankAccountBalance(f.store, "banco", input.date)).toFixed(2), "4.00");
  assert.equal((await f.registry(eq(taxRegistryEntries.id, requestId))).status, "RESTITUIDA");
  assert.equal(await f.n(revenues), 1);
  assert.equal(await f.n(accountingTransactions, eq(accountingTransactions.eventType, "TAX_CREDIT_REFUNDED")), 1);
}));

test("P2: compensação extingue saldo sem nova arrecadação e a guia cobra somente o restante", async () => scenario(async (f) => {
  const initial = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: initial.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { idempotencyKey: "compensation-ingress", guideNumber: guide.guideNumber!, amount: "6.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO" });
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  const target = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const input = { creditId: credit.id, operation: "COMPENSAR" as const, amount: "2.00", assessmentId: target.id, reason: "Compensar débito", idempotencyKey: "compensation" };
  const event = await applyTaxCredit(f.db, f.actor, input);
  assert.equal((await applyTaxCredit(f.db, f.actor, input)).id, event.id);
  await assert.rejects(applyTaxCredit(f.db, f.actor, { ...input, amount: "1.00" }), /outros dados/i);
  assert.equal((await getAssessmentAccount(f.store, target.id)).position.balance.toFixed(2), "2.00");
  const remainder = await generateTaxGuide(f.db, f.actor, { assessmentId: target.id, dueDate: new Date("2026-11-01") });
  assert.equal(remainder.totalValueDecimal!.toFixed(2), "2.00");
  assert.equal(await f.n(revenues), 1);
  assert.equal((await getBankAccountBalance(f.store, "banco", new Date("2026-11-02"))).toFixed(2), "6.00");
  await confirmTaxPayment(f.db, f.actor, { guideId: remainder.id, amountPaid: "2.00", paymentDate: new Date("2026-11-01"), paymentMethod: "Manual", idempotencyKey: "compensation-remainder" });
  assert.equal((await f.store.select().from(taxAssessments).where(eq(taxAssessments.id, target.id)))[0].status, "Pago");
  const [originPayment] = await f.store.select().from(taxPayments).where(eq(taxPayments.guideId, guide.id)).limit(1);
  const collectionReversal = { paymentId: originPayment.id, date: new Date("2026-12-01"), reason: "Reversão da origem indevida", idempotencyKey: "used-credit-collection-reversal" };
  await assert.rejects(reverseTaxPayment(f.db, f.actor, collectionReversal), /já utilizado/i);
  const inverse = { movementId: String(taxScopeSnapshot(event.result).movementId), date: new Date("2026-12-01"), reason: "Compensação aplicada indevidamente", idempotencyKey: "compensation-reversal" };
  await assert.rejects(reverseTaxCreditMovement(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, inverse), /autorizadas/i);
  const reversed = await reverseTaxCreditMovement(f.db, f.actor, inverse);
  assert.equal((await reverseTaxCreditMovement(f.db, f.actor, inverse)).id, reversed.id);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, { ...inverse, reason: "Outro fundamento de reversão" }), /outros dados/i);
  assert.equal((await getAssessmentAccount(f.store, target.id)).position.balance.toFixed(2), "2.00");
  assert.equal((await f.store.select().from(taxAssessments).where(eq(taxAssessments.id, target.id)))[0].status, "Parcial");
  assert.equal((await getBankAccountBalance(f.store, "banco", inverse.date)).toFixed(2), "8.00");
  await reverseTaxPayment(f.db, f.actor, collectionReversal);
  assert.equal((await getBankAccountBalance(f.store, "banco", inverse.date)).toFixed(2), "2.00");
}));

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P2 ${jurisdiction}: compensação autorizada entre contribuintes conserva caixa, saldo, replay e reversão`, async () => scenario(async (f) => {
  const origin = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: origin.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { guideNumber: guide.guideNumber!, amount: "6.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO", idempotencyKey: "authorized-origin" });
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  await f.pg.exec(`INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('authorized-company','Destinatário autorizado','11444777000161',CURRENT_TIMESTAMP)`);
  await f.store.insert(taxpayers).values({ id: "authorized-destination", taxpayerType: "PJ", companyId: "authorized-company", status: "Ativo" });
  const target = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "authorized-destination", taxableBase: "100.00", rate: "4" });
  const input = { creditId: credit.id, operation: "COMPENSAR" as const, assessmentId: target.id, amount: "2.00", reason: "Compensação autorizada do crédito de outro contribuinte", idempotencyKey: "authorized-compensation", authorizationDocumentId: "documento-fiscal" };
  await assert.rejects(applyTaxCredit(f.db, f.actor, { ...input, authorizationDocumentId: undefined }), /autorização GED válida/i);
  await assert.rejects(applyTaxCredit(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/i);
  await f.pg.exec(`CREATE FUNCTION fail_authorized_compensation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='CREDIT_MOVEMENT' THEN RAISE EXCEPTION 'injected authorized compensation failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_authorized_compensation BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_authorized_compensation();`);
  await assert.rejects(applyTaxCredit(f.db, f.actor, input), databaseFailure(/injected authorized compensation failure/i));
  assert.equal((await getAssessmentAccount(f.store, target.id)).position.balance.toFixed(2), "4.00");
  assert.equal(await f.n(accountingTransactions, eq(accountingTransactions.eventType, "TAX_CREDIT_COMPENSATED")), 0);
  assert.equal(taxScopeSnapshot((await f.registry(eq(taxRegistryEntries.id, credit.id))).data).available, "2.00");
  await f.pg.exec(`DROP TRIGGER fail_authorized_compensation ON "TaxRegistryEntry"; DROP FUNCTION fail_authorized_compensation();`);
  const event = await applyTaxCredit(f.db, f.actor, input);
  assert.equal((await applyTaxCredit(f.db, f.actor, input)).id, event.id);
  await assert.rejects(applyTaxCredit(f.db, f.actor, { ...input, authorizationDocumentId: "other" }), /outros dados/i);
  assert.equal((await getAssessmentAccount(f.store, target.id)).position.balance.toFixed(2), "2.00");
  const movementId = String(taxScopeSnapshot(event.result).movementId);
  const movement = await f.registry(eq(taxRegistryEntries.id, movementId));
  assert.equal(taxScopeSnapshot(movement.data).sourceTaxpayerId, "taxpayer-chain");
  assert.equal(taxScopeSnapshot(movement.data).authorizationDocumentId, "documento-fiscal");
  await reverseTaxCreditMovement(f.db, f.actor, { movementId, date: new Date("2026-12-01"), reason: "Revogação da compensação autorizada", idempotencyKey: "authorized-reversal" });
  assert.equal((await getAssessmentAccount(f.store, target.id)).position.balance.toFixed(2), "4.00");
  assert.equal(taxScopeSnapshot((await f.registry(eq(taxRegistryEntries.id, credit.id))).data).available, "2.00");
  assert.equal((await getBankAccountBalance(f.store, "banco", new Date("2026-12-01"))).toFixed(2), "6.00");
  assert.equal(await f.n(revenues), 1);
}, jurisdiction));

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P2 ${jurisdiction}: estorno de restituição paga recompõe caixa/crédito atomicamente com GED e preserva histórico`, async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { idempotencyKey: "paid-undo-origin", guideNumber: guide.guideNumber!, amount: "6.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO" });
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  const requested = await applyTaxCredit(f.db, f.actor, { creditId: credit.id, operation: "RESTITUIR", amount: "2.00", reason: "Devolver excedente", idempotencyKey: "paid-undo-request" });
  const requestId = String(taxScopeSnapshot(requested.result).movementId);
  await approveRefundRequest(f.db, f.actor, { requestId, approved: true, reason: "Aprovação" });
  await executeTaxRefund(f.db, f.actor, { requestId, bankAccountId: "banco", proofDocumentId: "documento-fiscal", date: new Date("2026-03-02"), idempotencyKey: "paid-undo" });
  const inverse = { movementId: requestId, date: new Date("2026-03-03"), reason: "Retorno comprovado dos recursos pagos indevidamente", idempotencyKey: "paid-undo-reversal", proofDocumentId: "documento-fiscal" };
  await assert.rejects(reverseTaxCreditMovement(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, inverse), /autorizadas/i);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, { ...inverse, proofDocumentId: undefined }), /comprovante GED válido/i);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, { ...inverse, date: new Date("2026-03-01") }), /data incompatível/i);
  await f.store.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-03-01"), status: "FECHADO" });
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, inverse), /competencia contabil nao esta aberta/i);
  await f.store.update(monthlyAccountingCloses).set({ status: "ABERTO" });
  const baseline = await f.n(accountingTransactions);
  await f.pg.exec(`CREATE FUNCTION fail_refund_reversal_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CREDIT_MOVEMENT_REVERSED' THEN RAISE EXCEPTION 'injected refund reversal failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_refund_reversal_event BEFORE INSERT ON "TaxIntegrationEvent" FOR EACH ROW EXECUTE FUNCTION fail_refund_reversal_event();`);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, inverse), databaseFailure(/injected refund reversal failure/i));
  assert.equal((await getBankAccountBalance(f.store, "banco", inverse.date)).toFixed(2), "4.00");
  assert.equal((await f.registry(eq(taxRegistryEntries.id, requestId))).status, "RESTITUIDA");
  assert.equal(taxScopeSnapshot((await f.registry(eq(taxRegistryEntries.id, credit.id))).data).available, "0.00");
  assert.equal(await f.n(accountingTransactions), baseline);
  assert.equal(await f.n(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.sourceType, "TAX_REFUND_REVERSAL")), 0);
  await f.pg.exec(`DROP TRIGGER fail_refund_reversal_event ON "TaxIntegrationEvent"; DROP FUNCTION fail_refund_reversal_event();`);
  const event = await reverseTaxCreditMovement(f.db, f.actor, inverse);
  assert.equal((await reverseTaxCreditMovement(f.db, f.actor, inverse)).id, event.id);
  await assert.rejects(reverseTaxCreditMovement(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, inverse), /autorizadas/i);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, { ...inverse, proofDocumentId: "outro-documento" }), /outros dados/i);
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, { ...inverse, idempotencyKey: "second-reversal" }), /não está disponível/i);
  assert.equal((await getBankAccountBalance(f.store, "banco", new Date("2026-03-02"))).toFixed(2), "4.00");
  assert.equal((await getBankAccountBalance(f.store, "banco", inverse.date)).toFixed(2), "6.00");
  assert.equal(taxScopeSnapshot((await f.registry(eq(taxRegistryEntries.id, credit.id))).data).available, "2.00");
  assert.equal(await f.n(revenues), 1);
  assert.equal(await f.n(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.sourceType, "TAX_REFUND")), 1);
  assert.equal(await f.n(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.sourceType, "TAX_REFUND_REVERSAL")), 1);
  assert.equal(await f.n(accountingTransactions, eq(accountingTransactions.eventType, "TAX_REFUND_REVERSED")), 1);
  const [payment] = await f.store.select().from(taxPayments).limit(1);
  await reverseTaxPayment(f.db, f.actor, { paymentId: payment.id, date: inverse.date, reason: "Estorno da origem após recuperação do excedente", idempotencyKey: "paid-undo-collection" });
  assert.equal((await getBankAccountBalance(f.store, "banco", inverse.date)).toFixed(2), "0.00");
}, jurisdiction));

test("P2: reversão de crédito transferido e restituição não paga recompõe saldo sem movimentar caixa", async () => scenario(async (f) => {
  const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, taxId: "tax-chain", taxpayerId: "taxpayer-chain", taxableBase: "100.00", rate: "4" });
  const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-03-31") });
  await processCollectionReturn(f.db, f.actor, { guideNumber: guide.guideNumber!, amount: "7.00", occurredAt: new Date("2026-03-01"), status: "CONFIRMADO", idempotencyKey: "credit-undo-origin" });
  const credit = await f.registry(eq(taxRegistryEntries.category, "TAX_CREDIT"));
  await f.pg.exec(`INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('credit-company','Destinatário do crédito','11444777000161',CURRENT_TIMESTAMP)`);
  await f.store.insert(taxpayers).values({ id: "credit-destination", taxpayerType: "PJ", companyId: "credit-company", status: "Ativo" });
  const transferred = await applyTaxCredit(f.db, f.actor, { creditId: credit.id, operation: "TRANSFERIR", amount: "2.00", destinationTaxpayerId: "credit-destination", reason: "Transferência de ensaio", idempotencyKey: "credit-transfer" });
  const destination = await f.registry(and(eq(taxRegistryEntries.category, "TAX_CREDIT"), eq(taxRegistryEntries.source, "TRANSFERENCIA"))!);
  const refund = await applyTaxCredit(f.db, f.actor, { creditId: destination.id, operation: "RESTITUIR", amount: "1.00", reason: "Restituição de ensaio", idempotencyKey: "destination-refund" });
  const inverseTransfer = { movementId: String(taxScopeSnapshot(transferred.result).movementId), date: new Date("2026-12-01"), reason: "Transferência indevida", idempotencyKey: "undo-transfer" };
  await assert.rejects(reverseTaxCreditMovement(f.db, f.actor, inverseTransfer), /já utilizado/i);
  const inverseRefund = { movementId: String(taxScopeSnapshot(refund.result).movementId), date: new Date("2026-12-01"), reason: "Solicitação indevida", idempotencyKey: "undo-refund" };
  const restoredRefund = await reverseTaxCreditMovement(f.db, f.actor, inverseRefund);
  assert.equal((await reverseTaxCreditMovement(f.db, f.actor, inverseRefund)).id, restoredRefund.id);
  const restoredTransfer = await reverseTaxCreditMovement(f.db, f.actor, inverseTransfer);
  assert.equal((await reverseTaxCreditMovement(f.db, f.actor, inverseTransfer)).id, restoredTransfer.id);
  const origin = await f.registry(eq(taxRegistryEntries.id, credit.id));
  assert.equal(taxScopeSnapshot(origin.data).available, "3.00");
  assert.equal((await f.registry(eq(taxRegistryEntries.id, destination.id))).status, "ESTORNADO");
  assert.equal((await getBankAccountBalance(f.store, "banco", inverseTransfer.date)).toFixed(2), "7.00");
  assert.equal(await f.n(accountingTransactions, isNotNull(accountingTransactions.reversalOfId)), 0);
}));
