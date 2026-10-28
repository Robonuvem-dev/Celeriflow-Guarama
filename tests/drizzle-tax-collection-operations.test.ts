import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as mappings from "../src/db/schema/tax-collection-operations";
import { economicRegistrations, taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { documents } from "../src/db/schema/registry";
import { taxInvoices } from "../src/db/schema/taxation-nfse";
import { dteMailboxes, dteMessages, dteMessageEvents } from "../src/db/schema/taxation-dte";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { taxActiveDebts, taxPayments } from "../src/db/schema/tax-accounting";
import { accountingEntries, accountingTransactions } from "../src/db/schema/finance-accounting";
import { financialYears } from "../src/db/schema/finance-years";
import { importSimplesBatch, processSimplesDivergences, communicateSimplesDivergence, rectifySimplesDivergence, prepareSimplesExclusion, communicateSimplesExclusion } from "../src/lib/tributacao/s5-service";
import { createDesifInstitution, createDesifAgency, createDesifCatalog, receiveDesifImport, validateDesifImport, processDesifImport, issueDesifGuide, openDesifFiscalCase, communicateDesifFiscalCase, assertDesifReceipt } from "../src/lib/tributacao/s6-service";
import { createCollectionPortfolio, scheduleCollectionAction, completeCollectionAction, collectionDashboard, simulateInstallment, createInstallmentAgreement, applyInstallmentPayment, reviseInstallmentOrigin, reparcelInstallment, changeInstallmentStatus, grantPortalAccess, createBenefitRule, grantBenefit, createPrizeDraw, issuePrizeCoupon, executePrizeDraw } from "../src/lib/tributacao/s8-service";
import { executeDeterministicDraw } from "../src/lib/tributacao/s8-engine";
import { upsertAccountant, upsertCompany, linkCompanyAccountant, upsertRule, importMovements, importRepasse, importIndices, processCompetency, notifyCorrection, markNotificationRead, resolveCrossCheck, createEstimate, vafReports, listVafOverview } from "../src/lib/tributacao/s10-service";
import { configureTaxAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { recognizeTaxAssessmentInTransaction } from "../src/lib/tributacao/accrual-accounting";
import { taxChainObject as object, countTaxRows } from "./helpers/tax-chain-database";
import { createTaxCollectionOperationsFixture } from "./helpers/drizzle-tax-collection-operations-fixture";

const causeContains = (message: string) => (error: unknown): boolean => error instanceof Error && (error.message.includes(message) || causeContains(message)(error.cause));

test("Collection operations: 57 complete runtime mappings match the independent physical catalog", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  assert.equal(Object.keys(mappings).length, 57);
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const installed = catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(config.columns.length, installed.length, config.name);
    for (const column of config.columns) {
      const physical = installed.find(row => row.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null);
      assert.equal(column.getSQLType().replace(/\s/g, "").replace("withouttimezone", ""), physical.type.replace(/\s/g, "").replace("withouttimezone", ""));
    }
  }
});

test("S5: import checksum, municipal DAS, cadastral history, malha, DTE and exclusion", async t => {
  const f = await createTaxCollectionOperationsFixture();
  const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
  try {
    assert.equal(f.history.length, 156);
    await t.test("atomic imports, accepted/rejected rows, Decimal/JSON and checksum replay", async () => {
      const input = { sourceType: "PGDAS", fileName: "pgdas.json", competence: "01/2026", rows: [{ taxpayerId: "co-pj", declaredService: 100.01, municipalIss: 5.01, rate: 5, activityCode: "6201501", raw: { amount: "001.00", date: "not-a-date", nullable: null, array: [1, "1", null] } }, { taxpayerId: "co-inactive" }, { taxpayerId: "unknown" }] };
      const [a, b] = await Promise.all([importSimplesBatch(f.connection, actor, input), importSimplesBatch(f.connection, actor, input)]);
      assert.equal(a.id, b.id); assert.equal(a.acceptedRows, 1); assert.equal(a.rejectedRows, 2);
      assert.deepEqual(a.errorSummary, { rejectedRows: 2, reason: "Contribuinte não localizado ou inativo." });
      assert.ok(a.createdAt instanceof Date);
      const [record] = await f.db.select().from(mappings.simplesFiscalRecords).where(eq(mappings.simplesFiscalRecords.importBatchId, a.id));
      assert.equal(record.declaredServiceDecimal.toFixed(2), "100.01"); assert.equal(record.rate?.toFixed(6), "5.000000"); assert.deepEqual(record.rawData, input.rows[0].raw);
      const before = await countTaxRows(f.db, "SimplesImportBatch");
      await assert.rejects(importSimplesBatch(f.connection, actor, { ...input, fileName: "bad-competence", rows: [{ taxpayerId: "co-pj", competence: "2026-01" }] }), /MM\/AAAA/);
      assert.equal(await countTaxRows(f.db, "SimplesImportBatch"), before);
      await importSimplesBatch(f.connection, actor, { sourceType: "DAF607", fileName: "daf.json", competence: "01/2026", rows: [{ taxpayerId: "co-pj", municipalIss: 5.01, confirmedPayment: 5.01, nationalDasTotal: 500.01 }] });
      const [allocation] = await f.db.select().from(mappings.simplesPaymentAllocations);
      assert.equal(allocation.nationalDasDecimal.toFixed(2), "500.01"); assert.equal(allocation.confirmedDecimal.toFixed(2), "5.01"); assert.equal(allocation.differenceDecimal.toFixed(2), "0.00");
    });
    await t.test("PERIODOS_OPCAO shares history/audit transaction including a late failure", async () => {
      const input = { sourceType: "PERIODOS_OPCAO", fileName: "opcao.json", competence: "01/2026", rows: [{ taxpayerId: "co-pj", startDate: "2026-01-01", regime: "Simples Nacional" }] };
      await f.database.exec(`CREATE FUNCTION co_fail_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='UPDATE_ECONOMIC_REGISTRATION' THEN RAISE EXCEPTION 'co history failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_history BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION co_fail_history();`);
      await assert.rejects(importSimplesBatch(f.connection, actor, input), causeContains("co history failure"));
      assert.equal(await countTaxRows(f.db, "SimplesOptionPeriod"), 0);
      assert.equal((await f.db.select().from(economicRegistrations))[0].taxRegime, "Normal");
      await f.database.exec('DROP TRIGGER co_fail_history ON "TaxAuditLog"; DROP FUNCTION co_fail_history();');
      await importSimplesBatch(f.connection, actor, input);
      const [period] = await f.db.select().from(mappings.simplesOptionPeriods);
      assert.equal(period.startDate.toISOString(), "2026-01-01T12:00:00.000Z"); assert.equal(period.endDate, null);
      assert.equal((await f.db.select().from(economicRegistrations))[0].taxRegime, "Simples Nacional");
      assert.ok((await f.db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "CADASTRAL_HISTORY"))).length >= 2);
    });
    await t.test("newest declarations, resolution events and DTE replay preserve original evidence", async () => {
      await f.db.insert(taxInvoices).values({ verificationCode: "co-nfse", serviceValue: 200.01, serviceValueDecimal: new Decimal("200.01"), issValue: 5.01, competence: "01/2026", providerId: "co-pj" });
      const processed = await processSimplesDivergences(f.connection, actor, "01/2026"); assert.ok(processed.processed > 0);
      const [divergence] = await f.db.select().from(mappings.simplesDivergences).where(eq(mappings.simplesDivergences.divergenceType, "NFSE_X_DECLARACAO"));
      assert.equal(divergence.revenueDifferenceDecimal.toFixed(2), "100.00");
      await assert.rejects(communicateSimplesDivergence(f.connection, actor, divergence.id), /DTE ativa/);
      await f.db.insert(dteMailboxes).values({ id: "co-mailbox", taxpayerId: "co-pj" });
      const message = await communicateSimplesDivergence(f.connection, actor, divergence.id);
      const replay = await communicateSimplesDivergence(f.connection, actor, divergence.id);
      assert.deepEqual(replay, message); assert.equal((await f.db.select().from(dteMessageEvents)).length, 1);
      await Promise.all([rectifySimplesDivergence(f.connection, actor, { divergenceId: divergence.id, declaredService: 200.01, municipalIss: 5.01, rate: 5, activityCode: "6201501" }), processSimplesDivergences(f.connection, actor, "01/2026")]);
      const [resolved] = await f.db.select().from(mappings.simplesDivergences).where(eq(mappings.simplesDivergences.id, divergence.id));
      assert.equal(resolved.status, "RESOLVIDA"); assert.ok(resolved.resolvedAt instanceof Date);
      await assert.rejects(communicateSimplesDivergence(f.connection, actor, divergence.id), /disponível/);
    });
    await t.test("PF/PJ exclusion keeps preparation distinct from effective federal exclusion", async () => {
      for (const taxpayerId of ["co-pj", "co-pf"]) {
        const item = await prepareSimplesExclusion(f.connection, actor, { taxpayerId, competence: "01/2026", reason: "Motivo|com\nquebra", calendarRevenue: 1000.01, legalLimit: 900 });
        assert.ok(item.documentId); assert.ok(item.exportContent?.includes(taxpayerId === "co-pj" ? "11222333000181" : "12345678909"));
        const [document] = await f.db.select().from(documents).where(eq(documents.id, item.documentId));
        assert.match(document.notes!, /Não representa exclusão/);
        if (taxpayerId === "co-pj") { const result = await communicateSimplesExclusion(f.connection, actor, item.id); assert.equal(result.status, "COMUNICADA"); assert.equal((await communicateSimplesExclusion(f.connection, actor, item.id)).dteMessageId, result.dteMessageId); }
      }
    });
  } finally { await f.close(); }
});

test("S6: bank/agency catalogs, validation, processing, DAM, fiscal case and DTE atomicity", async t => {
  const f = await createTaxCollectionOperationsFixture();
  try {
    const institution = await createDesifInstitution(f.connection, { taxpayerId: "co-pj", name: "Banco municipal", baseCnpj: "11.222.333", validFrom: "2026-01-01" });
    const agency = await createDesifAgency(f.connection, { institutionId: institution.id, economicRegistrationId: "co-registration", code: "0001", name: "Agência", fullCnpj: "11.222.333/0001-81", validFrom: "2026-01-01" });
    await assert.rejects(createDesifAgency(f.connection, { institutionId: institution.id, code: "0002", name: "Outra", fullCnpj: "99.888.777/0001-00", validFrom: "2026-01-01" }), /mesmo CNPJ/);
    const catalog = await createDesifCatalog(f.connection, { institutionId: institution.id, version: "1", validFrom: "2026-01-01", pgccCode: "7.1", pgccName: "Receitas", cosifCode: "7.1.1.01", cosifName: "Serviços", subtitleCode: "01", subtitleName: "Tarifas", rate: 5, tariffCode: "T1", tariffName: "Manutenção", tariffAmount: 10.01, packageCode: "P1", packageName: "Pacote" });
    const payload = { assessments: [{ agencyId: agency.id, subtitleId: catalog.subtitle.id, revenue: 1000.01, deduction: 100, credit: 1, debitAdjustment: 2 }], trialBalances: [{ agencyId: agency.id, pgccAccountId: catalog.pgcc.id, openingBalance: 100, credits: 50, debits: 20, declaredClose: 130, nature: "CREDORA" as const }], packageMovements: [{ agencyId: agency.id, packageId: catalog.package.id, accountHolders: 10, collectedRevenue: 90, rate: 5 }] };
    const input = { institutionId: institution.id, agencyId: agency.id, competence: "2026-01", moduleType: "APURACAO", fileName: "desif.json", abrasfVersion: "3.1", payload };
    const batch = await receiveDesifImport(f.connection, f.actor, input);
    assert.throws(() => assertDesifReceipt(batch), /recibo só existe/);
    await assert.rejects(processDesifImport(f.connection, f.actor, batch.id), /Somente arquivo validado/);
    const validated = await validateDesifImport(f.connection, f.actor, batch.id); assert.equal(validated.status, "VALIDADO");
    const processed = await processDesifImport(f.connection, f.actor, batch.id); assertDesifReceipt(processed);
    assert.ok(processed.processedAt instanceof Date); assert.match(processed.receiptNumber!, /^DESIF-202601-/);
    assert.deepEqual(await receiveDesifImport(f.connection, f.actor, input), processed);
    await assert.rejects(processDesifImport(f.connection, f.actor, batch.id), /Somente arquivo validado/);
    const [assessment] = await f.db.select().from(mappings.desifAssessments);
    assert.equal(assessment.taxDueDecimal.toFixed(2), "46.00");
    const [pack] = await f.db.select().from(mappings.desifPackageMovements);
    assert.equal(pack.potentialRevenueDecimal.toFixed(2), "100.10"); assert.equal(object(pack.details).policy, "CONFRONTO_INDEPENDENTE_SEM_DUPLA_CONTAGEM_COSIF");
    await t.test("late fiscal event failure rolls back auto-issued DAM, GED, infraction and process links", async () => {
      await f.database.exec(`CREATE FUNCTION co_fail_desif() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='DOCUMENTADA' THEN RAISE EXCEPTION 'co desif failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_desif BEFORE INSERT ON "DesifFiscalEvent" FOR EACH ROW EXECUTE FUNCTION co_fail_desif();`);
      await assert.rejects(openDesifFiscalCase(f.connection, f.actor, { assessmentId: assessment.id, findingType: "DIFERENCA", processId: "co-process" }), causeContains("co desif failure"));
      for (const table of ["TaxAssessment", "TaxGuide", "Infraction", "ProcessDocument", "DesifFiscalCase"]) assert.equal(await countTaxRows(f.db, table), 0, table);
      assert.equal(await countTaxRows(f.db, "Document"), 2);
      await f.database.exec('DROP TRIGGER co_fail_desif ON "DesifFiscalEvent"; DROP FUNCTION co_fail_desif();');
      const item = await openDesifFiscalCase(f.connection, f.actor, { assessmentId: assessment.id, findingType: "DIFERENCA", processId: "co-process" });
      assert.ok(item.guideId); assert.ok(item.infractionId); assert.ok(item.tiafDocumentId); assert.equal(await countTaxRows(f.db, "ProcessDocument"), 2);
      const guide = await issueDesifGuide(f.connection, assessment.id); assert.equal(guide?.id, item.guideId); assert.ok(guide?.documentId); assert.equal(guide.totalValueDecimal?.toFixed(2), "46.00");
      await f.db.insert(dteMailboxes).values({ taxpayerId: "co-pj" });
      const communicated = await communicateDesifFiscalCase(f.connection, f.actor, item.id);
      assert.equal(communicated.status, "COMUNICADA"); assert.equal((await communicateDesifFiscalCase(f.connection, f.actor, item.id)).dteMessageId, communicated.dteMessageId); assert.equal(await countTaxRows(f.db, "DteMessage"), 1);
    });
    const inconsistent = await receiveDesifImport(f.connection, f.actor, { ...input, fileName: "invalid.json", payload: { assessments: [{ agencyId: "unknown", subtitleId: "unknown", revenue: 1, deduction: 2 }] } });
    assert.equal((await validateDesifImport(f.connection, f.actor, inconsistent.id)).status, "INCONSISTENTE");
  } finally { await f.close(); }
});

test("S8: portfolios, exact installments, replay, revision, reparcelamento, portal and prize memory", async t => {
  const f = await createTaxCollectionOperationsFixture();
  try {
    const assessment = await f.assessment("co-origin");
    await f.db.insert(taxActiveDebts).values({ id: "co-debt", assessmentId: assessment.id, taxpayerId: "co-pj", year: 2026, originDebtType: "TRIBUTARIA", originalValue: 100.01, originalValueDecimal: new Decimal("100.01"), updatedValue: 100.01, updatedValueDecimal: new Decimal("100.01"), ...f.scope });
    const portfolio = await createCollectionPortfolio(f.connection, f.actor, { name: "Carteira", taxpayerIds: ["co-pj"] });
    assert.equal(portfolio.items.length, 1); assert.equal(portfolio.items[0].sourceType, "DIVIDA_ATIVA_LEITURA");
    await f.db.insert(taxAssessments).values({ id: "co-float-origin", taxId: "co-tax", taxpayerId: "co-pf", year: 2026, originalValue: 12.34, status: "Lançado" });
    const fallback = await createCollectionPortfolio(f.connection, f.actor, { name: "Origem histórica Float", taxpayerIds: ["co-pf"] });
    assert.equal(fallback.items[0].outstandingDecimal.toFixed(2), "12.34"); assert.equal(fallback.items[0].dueDate, null);
    const action = await scheduleCollectionAction(f.connection, f.actor, { portfolioId: portfolio.id, portfolioItemId: portfolio.items[0].id, taxpayerId: "co-pj", actionType: "CONTATO", modality: "ADMINISTRATIVA", channel: "DTE" });
    await completeCollectionAction(f.connection, f.actor, { actionId: action.id, resultCode: "ACORDO", description: "Contato realizado", nextActionAt: new Date("2026-12-01T12:34:56.789Z") });
    assert.equal((await collectionDashboard(f.db))[0].successfulContacts, 1);
    await f.db.insert(mappings.installmentRules).values({ id: "co-rule", code: "CO", name: "Parcelamento municipal", legalReference: "Lei municipal", minInstallments: 1, maxInstallments: 12, minQuotaDecimal: new Decimal(1), discountConfiguration: {}, feeConfiguration: {}, breakConfiguration: {}, dueDayOptions: [10, 31], effectiveFrom: new Date("2026-01-01") });
    assert.deepEqual(simulateInstallment({ total: "100.01", count: 3, dueDay: 31 }).quotas.map(v => v.toFixed(2)), ["33.33", "33.33", "33.35"]);
    const agreement = await createInstallmentAgreement(f.connection, f.actor, { taxpayerId: "co-pj", ruleId: "co-rule", total: 100.01, count: 3, dueDay: 31, sourceType: "LANCAMENTO", sourceId: assessment.id, originLabel: "Origem fiscal" });
    assert.ok(agreement.quotas.every(row => row.dueDate.getUTCHours() === 12)); assert.equal(agreement.events[0].eventType, "ADESAO");
    const paymentInput = { agreementId: agreement.id, paymentKey: "co-payment", amount: 40 };
    await Promise.all([applyInstallmentPayment(f.connection, f.actor, paymentInput), applyInstallmentPayment(f.connection, f.actor, paymentInput)]);
    const replay = await applyInstallmentPayment(f.connection, f.actor, paymentInput);
    assert.equal(replay.balanceDecimal.toFixed(2), "60.01"); assert.equal(replay.allocations.length, 2);
    await t.test("late payment and reparcelamento failures leave no quota/event or orphan child", async () => {
      await f.database.exec(`CREATE FUNCTION co_fail_installment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" IN ('PAGAMENTO','ORIGEM_REPARCELAMENTO') THEN RAISE EXCEPTION 'co installment failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_installment BEFORE INSERT ON "TaxInstallmentEvent" FOR EACH ROW EXECUTE FUNCTION co_fail_installment();`);
      await assert.rejects(applyInstallmentPayment(f.connection, f.actor, { ...paymentInput, paymentKey: "co-failed", amount: 10 }), causeContains("co installment failure"));
      await assert.rejects(reparcelInstallment(f.connection, f.actor, { agreementId: agreement.id, count: 2, dueDay: 10 }), causeContains("co installment failure"));
      assert.equal(await countTaxRows(f.db, "TaxInstallmentAgreement"), 1);
      assert.equal((await applyInstallmentPayment(f.connection, f.actor, paymentInput)).balanceDecimal.toFixed(2), "60.01");
      await f.database.exec('DROP TRIGGER co_fail_installment ON "TaxInstallmentEvent"; DROP FUNCTION co_fail_installment();');
    });
    const revised = await reviseInstallmentOrigin(f.connection, f.actor, { agreementId: agreement.id, debtId: agreement.debts[0].id, revisedAmount: 90.01, reason: "Revisão fundamentada" });
    assert.equal(revised.balanceDecimal.toFixed(2), "50.01");
    const child = await reparcelInstallment(f.connection, f.actor, { agreementId: agreement.id, count: 2, dueDay: 10 });
    assert.equal(child.totalAgreementDecimal.toFixed(2), "50.01");
    assert.equal((await changeInstallmentStatus(f.connection, f.actor, { agreementId: child.id, action: "ROMPER", reason: "Inadimplência" })).status, "ROMPIDO");
    assert.equal((await changeInstallmentStatus(f.connection, f.actor, { agreementId: child.id, action: "REATIVAR", reason: "Regularização" })).status, "REATIVADO");
    assert.equal((await changeInstallmentStatus(f.connection, f.actor, { agreementId: child.id, action: "CANCELAR", reason: "Decisão" })).status, "CANCELADO");
    const access = await grantPortalAccess(f.connection, f.actor, "co-pj"); assert.ok(Array.isArray(access.scopes) && access.scopes.includes("CERTIDOES")); assert.equal((await grantPortalAccess(f.connection, f.actor, "co-pj")).id, access.id);
    await t.test("paid-source eligibility, deterministic full-population hashes and immutable replay", async () => {
      const draw = await createPrizeDraw(f.connection, f.actor, { name: "Prêmio fiscal", year: 2026, drawNumber: 1, scheduledAt: new Date("2026-12-01"), winnerCount: 1, technicalSeed: "semente", requiresPayment: true });
      const guide = await f.guide("co-prize-guide", assessment.id);
      await assert.rejects(issuePrizeCoupon(f.connection, { drawId: draw.id, taxpayerId: "co-pj", sourceDocumentType: "GUIA", sourceDocumentId: guide.id }), /pagamento confirmado/);
      await f.db.insert(taxPayments).values({ guideId: guide.id, amountPaid: 1, amountPaidDecimal: new Decimal(1), paymentDate: new Date("2026-01-01"), paymentMethod: "Manual" });
      const [a, b] = await Promise.all([issuePrizeCoupon(f.connection, { drawId: draw.id, taxpayerId: "co-pj", sourceDocumentType: "GUIA", sourceDocumentId: guide.id }), issuePrizeCoupon(f.connection, { drawId: draw.id, taxpayerId: "co-pf", sourceDocumentType: "DOCUMENTO", sourceDocumentId: "co-document" })]);
      assert.notEqual(a.couponNumber, b.couponNumber);
      const coupons = await f.db.select().from(mappings.prizeCoupons).where(eq(mappings.prizeCoupons.drawId, draw.id));
      const expected = executeDeterministicDraw(coupons, draw.technicalSeed, draw.winnerCount);
      const [execution, again] = await Promise.all([executePrizeDraw(f.connection, f.actor, draw.id), executePrizeDraw(f.connection, f.actor, draw.id)]);
      assert.equal(execution.id, again.id); assert.equal(execution.inputHash, expected.inputHash); assert.equal(execution.resultHash, expected.resultHash); assert.equal(execution.status, "DEMONSTRACAO_TECNICA");
      await f.db.update(mappings.prizeCoupons).set({ status: "INELIGIVEL" }).where(eq(mappings.prizeCoupons.id, a.id));
      assert.equal((await executePrizeDraw(f.connection, f.actor, draw.id)).resultHash, execution.resultHash);
    });
  } finally { await f.close(); }
});

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`S8: benefit/accounting authorization, calendar, GED, immutable replay and late rollback (${jurisdiction})`, async () => {
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    let f: Awaited<ReturnType<typeof createTaxCollectionOperationsFixture>> | undefined;
    try {
      f = await createTaxCollectionOperationsFixture(jurisdiction);
      const fixture = f;
      await configureTaxAccountingProfile(f.connection, f.actor, { taxId: "co-tax", budgetUnitId: "co-unit", catalogVersionId: "co-catalog", receivableAccountId: "co-right", revenueAccountId: "co-vpa", deductionAccountId: "co-deduction", lossAccountId: "co-loss", effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Constituição do direito municipal", idempotencyKey: "co-profile" });
      const assessment = await f.assessment("co-benefit");
      await withDatabaseTransaction(f.connection, tx => recognizeTaxAssessmentInTransaction(tx, fixture.actor, assessment.id));
      await f.db.insert(taxActiveDebts).values({ id: "co-benefit-debt", assessmentId: assessment.id, taxpayerId: "co-pj", year: 2026, originDebtType: "TRIBUTARIA", originalValue: 100.01, originalValueDecimal: new Decimal("100.01"), updatedValue: 100.01, updatedValueDecimal: new Decimal("100.01"), ...f.scope });
      const rule = await createBenefitRule(f.connection, f.actor, { code: "RENUNCIA", name: "Benefício municipal", benefitType: "RENUNCIA", legalReference: "Lei municipal", value: 10, valueMode: "PERCENT", effectiveFrom: new Date("2026-01-01") });
      const input = { ruleId: rule.id, taxpayerId: "co-pj", sourceType: "TAX_ASSESSMENT", sourceId: assessment.id, originalAmount: 100.01, reason: "Concessão fundamentada", documentId: "co-document" };
      await assert.rejects(grantBenefit(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      await f.db.update(financialYears).set({ status: "Fechado" }).where(eq(financialYears.id, "co-year"));
      await assert.rejects(grantBenefit(f.connection, f.actor, input), /não está aberto/);
      await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "co-year"));
      await f.db.update(documents).set({ status: "Cancelado" }).where(eq(documents.id, "co-document"));
      await assert.rejects(grantBenefit(f.connection, f.actor, input), /GED/);
      await f.db.update(documents).set({ status: "Válido" }).where(eq(documents.id, "co-document"));
      const open = await f.guide("co-open", assessment.id);
      await assert.rejects(grantBenefit(f.connection, f.actor, input), /Cancele as guias/);
      await f.db.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, open.id));
      const before = await countTaxRows(f.db, "AccountingTransaction");
      await f.database.exec(`CREATE FUNCTION co_fail_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='GRANT_BENEFIT' THEN RAISE EXCEPTION 'co benefit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_benefit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION co_fail_benefit();`);
      await assert.rejects(grantBenefit(f.connection, f.actor, input), causeContains("co benefit failure"));
      assert.equal(await countTaxRows(f.db, "AccountingTransaction"), before); assert.equal(await countTaxRows(f.db, "TaxBenefitGrant"), 0); assert.equal(await countTaxRows(f.db, "TaxIntegrationEvent"), 0);
      assert.equal((await f.db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id)))[0].finalValueDecimal?.toFixed(2), "100.01");
      await f.database.exec('DROP TRIGGER co_fail_benefit ON "TaxAuditLog"; DROP FUNCTION co_fail_benefit();');
      const grant = await grantBenefit(f.connection, f.actor, input);
      assert.equal(grant.renunciationDecimal.toFixed(2), "10.00"); assert.equal(grant.finalAmountDecimal.toFixed(2), "90.01");
      assert.equal((await f.db.select().from(taxActiveDebts).where(eq(taxActiveDebts.id, "co-benefit-debt")))[0].updatedValueDecimal?.toFixed(2), "90.01");
      assert.deepEqual(await grantBenefit(f.connection, f.actor, input), grant);
      await assert.rejects(grantBenefit(f.connection, f.actor, { ...input, reason: "Outra decisão" }), /outros dados/);
      await assert.rejects(grantBenefit(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      const [current] = await f.db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id)); assert.deepEqual(object(current.calculationSnapshot).nested, { date: "not-a-date", amount: "001.00", nullable: null });
      const [posting] = await f.db.select().from(accountingTransactions).where(eq(accountingTransactions.eventType, "TAX_ASSESSMENT_BENEFIT"));
      const entries = await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posting.id)); assert.equal(entries.length, 2); assert.ok(entries.every(row => row.valueDecimal?.eq("10.00")));
      assert.equal(await countTaxRows(f.db, "Revenue"), 0); assert.equal(await countTaxRows(f.db, "TreasuryMovement"), 0);
      assert.equal((await f.db.select().from(taxAuditLogs).where(eq(taxAuditLogs.action, "GRANT_BENEFIT"))).length, 1);
    } finally { try { await f?.close(); } finally { if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; } }
  });
}

test("S10: immutable EFD/GIA imports, protocol rollback, rules, population, ranking and reports", async t => {
  const f = await createTaxCollectionOperationsFixture();
  try {
    await f.db.insert(mappings.vafExercises).values({ id: "co-exercise", year: 2026 });
    const accountant = await upsertAccountant(f.connection, { cpfCnpj: "12345678909", name: "Contador", email: "contador@example.invalid" });
    const a = await upsertCompany(f.connection, { cnpj: "11111111000111", corporateName: "Empresa A", accountantId: accountant.id, taxRegime: "SIMPLES NACIONAL" });
    const b = await upsertCompany(f.connection, { cnpj: "22222222000122", corporateName: "Empresa B" });
    await upsertCompany(f.connection, { cnpj: "33333333000133", corporateName: "Omissos" });
    assert.equal((await upsertAccountant(f.connection, { cpfCnpj: accountant.cpfCnpj, name: "Contador atualizado" })).email, accountant.email);
    await linkCompanyAccountant(f.connection, b.id, accountant.id);
    await upsertRule(f.connection, { exerciseId: "co-exercise", cfop: "5102", formula: "saida - entrada", effectiveFrom: new Date("2026-01-01") });
    const input = { companyId: a.id, exerciseId: "co-exercise", competency: "202601", fileName: "a-efd.json", movements: [{ cfop: "5102", operationType: "SAIDA" as const, value: 15000 }, { cfop: "5102", operationType: "ENTRADA" as const, value: 9000 }] };
    const original = await importMovements(f.connection, f.actor, "EFD", input);
    assert.equal(original.fileHash, createHash("sha256").update(JSON.stringify(input.movements)).digest("hex"));
    await t.test("late protocol failure restores old import and removes replacement", async () => {
      await f.database.exec(`CREATE FUNCTION co_fail_protocol() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'co protocol failure'; END $$; CREATE TRIGGER co_fail_protocol BEFORE INSERT ON "VafProtocol" FOR EACH ROW EXECUTE FUNCTION co_fail_protocol();`);
      await assert.rejects(importMovements(f.connection, f.actor, "EFD", { ...input, version: "2", substituteId: original.id }), causeContains("co protocol failure"));
      assert.equal(await countTaxRows(f.db, "VafEfdImport"), 1);
      assert.deepEqual((await f.db.select().from(mappings.vafEfdImports))[0], original);
      await f.database.exec('DROP TRIGGER co_fail_protocol ON "VafProtocol"; DROP FUNCTION co_fail_protocol();');
    });
    const replacement = await importMovements(f.connection, f.actor, "EFD", { ...input, version: "2", substituteId: original.id });
    const [old] = await f.db.select().from(mappings.vafEfdImports).where(eq(mappings.vafEfdImports.id, original.id)); assert.equal(old.status, "SUBSTITUIDO"); assert.deepEqual(old.rawData, original.rawData); assert.equal(replacement.parentImportId, original.id);
    await importMovements(f.connection, f.actor, "GIA", { ...input, fileName: "a-gia.json" });
    await importMovements(f.connection, f.actor, "EFD", { ...input, companyId: b.id, fileName: "b-efd.json", movements: [{ cfop: "5102", operationType: "SAIDA", value: 4000 }] });
    const processed = await processCompetency(f.connection, f.actor, { exerciseId: "co-exercise", competency: "202601" }); assert.deepEqual(processed, { total: "10000.00", companies: 3, omitted: 1 });
    const report = await vafReports(f.db, "co-exercise", "202601"); assert.equal(report.total, 10000); assert.equal(report.ranking[0].vaf, 6000); assert.equal(report.ranking[0].participation, 60); assert.equal(report.simples[0].vaf, 6000);
    const repasse = await importRepasse(f.connection, f.actor, { exerciseId: "co-exercise", competency: "202601", weekNumber: 1, municipalValue: 123.45, stateTotalValue: 1000.01 });
    const correction = await importRepasse(f.connection, f.actor, { exerciseId: "co-exercise", competency: "202601", weekNumber: 1, municipalValue: 124.45, stateTotalValue: 1001.01, version: "2", correctId: repasse.id }); assert.equal(correction.parentRepasseId, repasse.id);
    await importIndices(f.connection, { exerciseId: "co-exercise", competency: "202601", municipalProvisorio: 0.123456, companies: [{ companyId: a.id, provisorio: 0.6 }] });
    await importIndices(f.connection, { exerciseId: "co-exercise", competency: "202601", municipalDefinitivo: 0.223456 });
    const [index] = await f.db.select().from(mappings.vafMunicipalIndices); assert.equal(index.indexProvisorio?.toFixed(6), "0.123456"); assert.equal(index.indexDefinitivo?.toFixed(6), "0.223456"); assert.equal(index.totalVafProvisorio?.toFixed(2), "10000.00");
    const notification = await notifyCorrection(f.connection, { companyId: a.id, exerciseId: "co-exercise", competency: "202601", title: "Correção", content: "Conferir valores" }); assert.equal((await markNotificationRead(f.connection, notification.id)).status, "LIDA");
    const [issue] = await f.db.select().from(mappings.vafCrossChecks); assert.ok(issue); assert.equal((await resolveCrossCheck(f.connection, f.actor, issue.id, "CORRIGIDA")).resolvedBy, f.actor.usuarioId);
    const estimate = await createEstimate(f.connection, f.actor, { exerciseId: "co-exercise", competency: "202601", method: "LINEAR", realizedMonths: 1, realizedValue: 1000 }); assert.equal(estimate.estimatedValue.toFixed(2), "12000.00");
    const overview = await listVafOverview(f.db, 2026); assert.equal(overview.imports.length, 4); assert.ok(overview.protocols?.every(row => row.receivedAt instanceof Date)); assert.equal(overview.companies.find(row => row.id === b.id)?.accountant?.id, accountant.id);
    await t.test("late competency failure rolls back summaries, results, statuses and omissions", async () => {
      await importMovements(f.connection, f.actor, "EFD", { ...input, competency: "202602", fileName: "negative.json", movements: [{ cfop: "5102", operationType: "ENTRADA", value: 1 }] });
      await assert.rejects(processCompetency(f.connection, f.actor, { exerciseId: "co-exercise", competency: "202602" }), /negativo/);
      assert.equal(await countTaxRows(f.db, "VafMonthlySummary", sql`competency = '202602'`), 0); assert.equal(await countTaxRows(f.db, "VafResult", sql`competency = '202602'`), 0);
      const [untouched] = await f.db.select().from(mappings.vafEfdImports).where(and(eq(mappings.vafEfdImports.competency, "202602"), eq(mappings.vafEfdImports.companyId, a.id))); assert.equal(untouched.status, "IMPORTADO");
    });
    assert.equal((await f.db.select().from(dteMessages)).length, 0);
  } finally { await f.close(); }
});
