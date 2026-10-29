import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { taxActiveDebts, taxFinancialMappings, taxPayments } from "../src/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { cdaVersions, debtEvents, executionCases, executionEvents, protestItems } from "../src/db/schema/tax-active-debt";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "../src/db/schema/planning-catalog";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { cemeteryConcessions, cemeteryDeceased, cemeteryGraves, cemeteryMovements, cemeteryProcesses } from "../src/db/schema/cemeteries";
import { people } from "../src/db/schema/people";
import { createActiveDebtDrizzleFixture, activeDebtError } from "../src/db/repositories/tax-active-debt/test-fixture";
import { insertDebtAudit, insertDebtRegistry } from "../src/db/repositories/tax-active-debt/notices";
import { activeDebtSnapshot } from "../src/db/repositories/tax-active-debt/snapshot";
import { readDebt } from "../src/db/repositories/tax-active-debt/records";
import { adoptAuroraActiveDebtAccountsInTransaction } from "../src/db/repositories/tax-active-debt/account-adoption";
import { advanceCemeteryProcess, advanceExecutionCase, annotateCda, createCdaVersion, createCemeteryChapel, createCemeteryLot, createDaPortfolio, createExecutionBatch, createGrave, createProtestBatch, daBook, declarantDebtSnapshotExecutor, enrollAssessmentDebt, enrollCemeteryFeeInDebt, enrollManualDebt, ensureS9Defaults, grantConcession, issueCda, issueCemeteryFee, issueDaGuide, listEnrollmentCandidates, openExecutionCase, refreshDaPortfolio, registerDeceased, registerMni, registerMovement, registerProtestReturn, resolveProtestItem, resumeDebt, returnDebtToOrigin, runPrescription, scheduleHearing, selectProtestCandidates, settleDebtByGuide, signCdaInternal, suspendDebt, tributarioBi, validateDebt, writeOffDebt } from "../src/lib/tributacao/s9-service";
import { cancelDebtNotice, issueDebtNoticeBatch, selectDebtNoticeTargets } from "../src/lib/tributacao/debt-notices";
import { renderDebtNoticeOutput } from "../src/lib/tributacao/debt-notice-output";
import { configureTaxAccountingProfile, configureTaxDebtAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { recognizeTaxAssessmentInTransaction } from "../src/lib/tributacao/accrual-accounting";
import { getBankAccountBalance } from "../src/lib/financeiro";

test("Dívida ativa: núcleo S9 e notificações sobre todo o SQL histórico", async t => {
  const f = await createActiveDebtDrizzleFixture();
  const { db, connection, actor } = f;
  const manual = (key: string) => enrollManualDebt(connection, actor, { taxpayerId: "payer", originDebtType: "Tributo DA", year: 2020, value: 123.45, sourceKey: key, budgetUnitId: "ug", competence: new Date("2020-02-03T23:59:59.123Z") });
  try {
    assert.equal(f.migrationCount, 156);
    await t.test("origem manual: replay concorrente, UG/ente, competência UTC, futuros e rollback final", async () => {
      const result = await Promise.all([manual("manual"), manual("manual")]);
      assert.equal(result[0].debt.id, result[1].debt.id);
      assert.equal(result.filter(row => row.created).length, 1);
      const id = result[0].debt.id;
      assert.equal((await readDebt(db, id)).originalValueDecimal?.toFixed(2), "123.45");
      const events = await db.select().from(debtEvents).where(eq(debtEvents.activeDebtId, id));
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].payload, { sourceKey: "manual", competence: "2020-02-03T23:59:59.123Z" });
      const input = { taxpayerId: "payer", originDebtType: "Tributo DA", year: 2020, value: 123.45, sourceKey: "manual", budgetUnitId: "ug" };
      await assert.rejects(enrollManualDebt(connection, actor, input), activeDebtError(/Competência/));
      await assert.rejects(enrollManualDebt(connection, actor, { ...input, value: 124 }), activeDebtError(/outros dados/));
      await assert.rejects(enrollManualDebt(connection, { ...actor, allowedBudgetUnitIds: [] }, input), activeDebtError(/autorizada/));
      await assert.rejects(enrollManualDebt(connection, actor, { ...input, year: new Date().getUTCFullYear() + 1 }), activeDebtError(/Exercício/));
      await db.update(planningEntityUnits).set({ governmentEntityId: "other-ente" }).where(eq(planningEntityUnits.budgetUnitId, "ug"));
      await assert.rejects(validateDebt(connection, actor, id), activeDebtError(/vínculo municipal/));
      await db.update(planningEntityUnits).set({ governmentEntityId: "ente" }).where(eq(planningEntityUnits.budgetUnitId, "ug"));
      await f.database.exec(`CREATE FUNCTION fail_manual_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='INSCRICAO' THEN RAISE EXCEPTION 'manual final rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_manual_event BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_manual_event();`);
      try { await assert.rejects(manual("rollback-manual"), activeDebtError(/manual final rollback/)); }
      finally { await f.database.exec('DROP TRIGGER fail_manual_event ON "TaxActiveDebtEvent"; DROP FUNCTION fail_manual_event();'); }
      assert.equal((await db.select().from(taxActiveDebts).where(eq(taxActiveDebts.sourceKey, "rollback-manual"))).length, 0);
    });

    await t.test("CDA: sequência única, versões congeladas, anotação e assinatura interna idempotente", async () => {
      const { debt } = await manual("cda");
      await validateDebt(connection, actor, debt.id);
      await assert.rejects(issueCda(connection, { ...actor, allowedBudgetUnitIds: [] }, debt.id), activeDebtError(/autorizadas/));
      const results = await Promise.all([issueCda(connection, actor, debt.id), issueCda(connection, actor, debt.id)]);
      assert.equal(results[0].cdaNumber, results[1].cdaNumber);
      const first = (await db.select().from(cdaVersions).where(eq(cdaVersions.activeDebtId, debt.id)))[0];
      assert.equal(first.versionNumber, 1);
      const snapshot = structuredClone(first.contentSnapshot);
      await annotateCda(connection, actor, { debtId: debt.id, annotation: "Conferência fundamentada" });
      await db.update(people).set({ fullName: "Titular atual" }).where(eq(people.id, "person"));
      const versions = await Promise.all([createCdaVersion(connection, actor, debt.id), createCdaVersion(connection, actor, debt.id)]);
      assert.deepEqual(versions.map(row => row.versionNumber).sort(), [2, 3]);
      const signatures = await Promise.all([signCdaInternal(connection, actor, first.id), signCdaInternal(connection, actor, first.id)]);
      assert.equal(signatures[0].signedAt?.getTime(), signatures[1].signedAt?.getTime());
      const persisted = (await db.select().from(cdaVersions).where(eq(cdaVersions.id, first.id)))[0];
      assert.deepEqual(persisted.contentSnapshot, snapshot);
      assert.equal(persisted.annotation, "Conferência fundamentada");
      assert.equal(persisted.signatureStatus, "ASSINATURA_INTERNA");
      assert.equal((await db.select().from(debtEvents).where(and(eq(debtEvents.activeDebtId, debt.id), eq(debtEvents.eventType, "OBSERVACAO")))).length, 1);
      await db.update(people).set({ fullName: "Titular & Histórico" }).where(eq(people.id, "person"));
    });

    await t.test("suspensão, retomada, carteira Decimal e filtros administrativos vazios", async () => {
      const { debt } = await manual("portfolio");
      await issueCda(connection, actor, debt.id);
      const portfolio = await createDaPortfolio(connection, actor, { name: "Carteira conferida", minValue: 123.45, statuses: ["INSCRITA"] });
      assert(portfolio.items.some(item => item.activeDebtId === debt.id && item.outstandingDecimal.eq("123.45")));
      const until = new Date("2027-01-01T00:00:00.001Z");
      const suspension = await suspendDebt(connection, actor, { debtId: debt.id, reason: "Revisão", legalGround: "Lei municipal", endsAt: until });
      assert.equal(suspension.endsAt?.toISOString(), until.toISOString());
      assert.equal((await readDebt(db, debt.id)).status, "SUSPENSA");
      await resumeDebt(connection, actor, debt.id);
      assert.equal((await readDebt(db, debt.id)).status, "INSCRITA");
      await db.update(taxActiveDebts).set({ status: "PAGA", updatedValue: 0, updatedValueDecimal: new Decimal(0) }).where(eq(taxActiveDebts.id, debt.id));
      assert.equal(await refreshDaPortfolio(connection, portfolio.id, actor), portfolio.items.length - 1);
      assert.equal((await daBook(db, undefined, [])).length, 0);
      assert.equal((await listEnrollmentCandidates(db, [])).length, 0);
      assert.equal((await selectProtestCandidates(db, [])).length, 0);
      assert((await daBook(db, 2020, ["ug"])).some(row => row.id === debt.id));
    });

    await t.test("protesto: lote atômico, retorno parcial, desistência, anuência e pagamento comprovado", async () => {
      const debts = await Promise.all([manual("protest-a"), manual("protest-b"), manual("protest-c")]);
      for (const { debt } of debts) await issueCda(connection, actor, debt.id);
      const ids = debts.map(row => row.debt.id);
      await f.database.exec(`CREATE FUNCTION fail_protest_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROTESTO' THEN RAISE EXCEPTION 'protest final rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_protest_event BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_protest_event();`);
      try { await assert.rejects(createProtestBatch(connection, actor, ids), activeDebtError(/protest final rollback/)); }
      finally { await f.database.exec('DROP TRIGGER fail_protest_event ON "TaxActiveDebtEvent"; DROP FUNCTION fail_protest_event();'); }
      assert((await db.select().from(taxActiveDebts).where(inArray(taxActiveDebts.id, ids))).every(row => row.status === "INSCRITA"));
      assert.equal((await db.select().from(protestItems).where(inArray(protestItems.activeDebtId, ids))).length, 0);
      const batch = await createProtestBatch(connection, actor, ids);
      assert.equal((await registerProtestReturn(connection, actor, { batchId: batch.id, returns: [{ itemId: batch.items[0].id, code: "01", message: "Conferido" }] })).status, "RETORNO_PARCIAL");
      assert.equal((await registerProtestReturn(connection, actor, { batchId: batch.id, returns: batch.items.slice(1).map(item => ({ itemId: item.id, code: "01", message: "Conferido" })) })).status, "RETORNO_TOTAL");
      await assert.rejects(resolveProtestItem(connection, actor, { itemId: batch.items[2].id, action: "BAIXAR_PAGAMENTO", reason: "Sem arrecadação" }), activeDebtError(/lançamento e arrecadação/));
      assert.equal((await db.select().from(protestItems).where(eq(protestItems.id, batch.items[2].id)))[0].status, "EM_ACOMPANHAMENTO");
      await resolveProtestItem(connection, actor, { itemId: batch.items[0].id, action: "CANCELAR", reason: "Desistência fundamentada" });
      const consent = await resolveProtestItem(connection, actor, { itemId: batch.items[1].id, action: "ANUIR", reason: "Anuência fundamentada" });
      assert(consent.consentIssuedAt instanceof Date);
      await f.assessment("paid-protest");
      await f.guide("paid-protest-guide", "paid-protest");
      await db.insert(taxPayments).values({ guideId: "paid-protest-guide", amountPaid: 100, amountPaidDecimal: new Decimal(100), paymentDate: new Date(), paymentMethod: "Manual", status: "Confirmado" });
      await db.update(taxActiveDebts).set({ assessmentId: "paid-protest" }).where(eq(taxActiveDebts.id, batch.items[2].activeDebtId));
      const paid = await resolveProtestItem(connection, actor, { itemId: batch.items[2].id, action: "BAIXAR_PAGAMENTO", reason: "Arrecadação conferida" });
      assert.equal(paid.status, "BAIXADA_PAGAMENTO");
      assert.equal((await readDebt(db, paid.activeDebtId)).updatedValueDecimal?.toFixed(2), "0.00");
    });

    await t.test("execução: peças imutáveis, protocolo/MNI internos, agenda UTC e eventos na mesma tx", async () => {
      const { debt } = await manual("execution");
      await issueCda(connection, actor, debt.id);
      const attachments = [{ documentId: "GED-ref", amount: new Decimal("0.10"), reference: new Date("2026-09-01T23:59:59.123Z"), nullable: null }];
      const execution = await openExecutionCase(connection, actor, { debtId: debt.id, prosecutor: "Procuradoria", attorneyReference: "Ref. 42", attachments });
      const snapshot = structuredClone(execution.caseSnapshot);
      assert.deepEqual(execution.attachments, [{ documentId: "GED-ref", amount: "0.1", reference: "2026-09-01T23:59:59.123Z", nullable: null }]);
      await advanceExecutionCase(connection, actor, { caseId: execution.id, action: "ENVIAR_PROCURADORIA", description: "Peças conferidas" });
      await advanceExecutionCase(connection, actor, { caseId: execution.id, action: "REGISTRAR_PROTOCOLO", description: "Protocolo interno" });
      const mni = await registerMni(connection, actor, execution.id);
      assert.equal(mni.mniStatus, "MNI_REGISTRO_INTERNO");
      const date = new Date("2027-02-03T01:02:03.456Z");
      assert.equal((await scheduleHearing(connection, actor, { caseId: execution.id, date, notes: "Agenda" })).nextHearingAt?.toISOString(), date.toISOString());
      for (const action of ["ACOMPANHAR", "REGISTRAR_RETORNO", "REABRIR", "ENCERRAR"] as const) await advanceExecutionCase(connection, actor, { caseId: execution.id, action, description: action });
      assert.deepEqual((await db.select().from(executionCases).where(eq(executionCases.id, execution.id)))[0].caseSnapshot, snapshot);
      assert.equal((await db.select().from(executionEvents).where(eq(executionEvents.caseId, execution.id))).length, 9);
      const { debt: second } = await manual("batch-execution");
      await issueCda(connection, actor, second.id);
      await assert.rejects(createExecutionBatch(connection, actor, { debtIds: [second.id, debt.id], prosecutor: "Procuradoria" }), activeDebtError(/estágio de execução/));
      assert.equal((await readDebt(db, second.id)).status, "INSCRITA");
      assert.equal((await db.select().from(executionCases).where(eq(executionCases.activeDebtId, second.id))).length, 0);
    });

    await t.test("posição do declarante sem corte de 120 e sem duplicar dívida inscrita", async () => {
      await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('snapshot-payer','PF',CURRENT_TIMESTAMP)`);
      await db.insert(taxAssessments).values(Array.from({ length: 123 }, (_, index) => ({ id: `snapshot-${index}`, taxpayerId: "snapshot-payer", taxId: "tax", year: 2026, originalValue: 0.1, originalValueDecimal: new Decimal("0.10"), finalValueDecimal: new Decimal("0.10"), status: "Lançado" })));
      await db.insert(taxActiveDebts).values({ taxpayerId: "snapshot-payer", originDebtType: "Tributo DA", year: 2026, originalValue: 0.2, originalValueDecimal: new Decimal("0.20"), updatedValue: 0.2, updatedValueDecimal: new Decimal("0.20"), assessmentId: "snapshot-0" });
      const snapshot = await declarantDebtSnapshotExecutor(db, "snapshot-payer");
      assert.equal(snapshot.assessmentCount, 122);
      assert.equal(snapshot.activeDebtCount, 1);
      assert.equal(snapshot.total, "12.40");
      assert.equal(await withDatabaseTransaction(connection, async tx => (await declarantDebtSnapshotExecutor(tx, "snapshot-payer")).total), "12.40");
    });

    await t.test("notificações: seleção Decimal, impressão histórica, cancelamento e rollback da auditoria", async () => {
      await f.assessment("notice", "100.03", { realEstateId: "property" });
      await f.guide("notice-guide", "notice", "100.03");
      await db.insert(taxPayments).values({ guideId: "notice-guide", amountPaid: 0.01, amountPaidDecimal: new Decimal("0.01"), paymentDate: new Date(), paymentMethod: "Manual" });
      const filter = { governmentEntityId: "ente", budgetUnitId: "ug", kind: "PROPERTY" as const, year: 2026, taxId: "tax", taxpayerId: "payer", propertyId: "property", streetId: null, neighborhoodId: null, addressContains: "memória", minimumBalance: "0.01", overdueOnly: true };
      const preview = await selectDebtNoticeTargets(db, actor, filter);
      assert.equal(preview.targets.length, 1);
      assert.equal(preview.targets[0].balance, "100.02");
      const input = { filter, expectedFingerprint: preview.fingerprint, type: "NOTICE" as const, title: "Aviso <histórico>", body: "Memória conferida & preservada", legalBasis: "Lei municipal", includeBankSlip: false, reason: "Conferência" };
      await assert.rejects(issueDebtNoticeBatch(connection, actor, { ...input, includeBankSlip: true }), activeDebtError(/boleto exige/));
      await f.database.exec(`CREATE FUNCTION fail_notice_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ISSUE_DEBT_NOTICES' THEN RAISE EXCEPTION 'notice final rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_notice_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION fail_notice_audit();`);
      try { await assert.rejects(issueDebtNoticeBatch(connection, actor, input), activeDebtError(/notice final rollback/)); }
      finally { await f.database.exec('DROP TRIGGER fail_notice_audit ON "TaxAuditLog"; DROP FUNCTION fail_notice_audit();'); }
      assert.equal((await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "DEBT_NOTICE_ISSUANCE"))).length, 0);
      const issued = await issueDebtNoticeBatch(connection, actor, input);
      await db.update(people).set({ fullName: "Titular posterior" }).where(eq(people.id, "person"));
      const xml = await renderDebtNoticeOutput(db, actor, { batchId: issued.batchId, format: "XML" });
      assert.match(new TextDecoder().decode(xml.bytes), /Titular &amp; Histórico/);
      assert.match(new TextDecoder().decode(xml.bytes), /<saldo>100.02<\/saldo>/);
      const pdf = await renderDebtNoticeOutput(db, actor, { noticeId: issued.noticeIds[0], format: "PDF" });
      assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), "%PDF-");
      await assert.rejects(renderDebtNoticeOutput(db, { ...actor, allowedBudgetUnitIds: [] }, { batchId: issued.batchId, format: "TXT" }), activeDebtError(/UG autorizada/));
      await cancelDebtNotice(connection, actor, { noticeId: issued.noticeIds[0], reason: "Cancelamento fundamentado" });
      await assert.rejects(cancelDebtNotice(connection, actor, { noticeId: issued.noticeIds[0], reason: "Repetição" }), activeDebtError(/já cancelada/));
      const output = await renderDebtNoticeOutput(db, actor, { batchId: issued.batchId, format: "TXT" });
      assert.match(new TextDecoder().decode(output.bytes), /CANCELADA\|Titular & Histórico/);
      const changed = await selectDebtNoticeTargets(db, actor, filter);
      assert.notEqual(changed.fingerprint, preview.fingerprint);
      await assert.rejects(issueDebtNoticeBatch(connection, actor, input), activeDebtError(/alterados/));
      assert.equal((await db.select({ value: count() }).from(taxAuditLogs).where(eq(taxAuditLogs.action, "ISSUE_DEBT_NOTICES")))[0].value, 1);
      await db.update(people).set({ fullName: "Titular & Histórico" }).where(eq(people.id, "person"));
    });

    await t.test("econômico: inscrição/titular, endereço do perfil e origem municipal exata", async () => {
      await f.assessment("notice-economic", "0.30", { economicRegistrationId: "registration" });
      await f.guide("notice-economic-guide", "notice-economic", "0.30");
      await withDatabaseTransaction(connection, tx => insertDebtRegistry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: "registration", category: "ECONOMIC_PROFILE", title: "Perfil", data: { governmentEntityId: "ente", budgetUnitId: "ug", companyAddress: { street: "Rua Econômica", number: "42", city: "Município" } } }));
      const filter = { governmentEntityId: "ente", budgetUnitId: "ug", kind: "ECONOMIC" as const, year: 2026, taxId: "tax", taxpayerId: "payer", propertyId: null, economicRegistrationId: "registration", streetId: null, neighborhoodId: null, addressContains: "econômica", minimumBalance: "0.30", overdueOnly: true };
      const targets = (await selectDebtNoticeTargets(db, actor, filter)).targets;
      assert.equal(targets.length, 1);
      assert.equal(targets[0].registrationId, "registration");
      assert.equal(targets[0].balance, "0.30");
      assert.equal((await selectDebtNoticeTargets(db, actor, { ...filter, taxpayerId: "unrelated" })).targets.length, 0);
      assert.equal((await selectDebtNoticeTargets(db, actor, { ...filter, addressContains: "Outro" })).targets.length, 0);
      await assert.rejects(selectDebtNoticeTargets(db, actor, { ...filter, propertyId: "property" }), activeDebtError(/tipo de cadastro/));
      await assert.rejects(selectDebtNoticeTargets(db, actor, { ...filter, governmentEntityId: "other-ente" }), activeDebtError(/Origem não conciliada/));
    });

    await t.test("notificação: compensação, cota condicional vencida, futuro e memória bruta conciliada", async () => {
      await db.execute(sql`INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId","updatedAt") VALUES ('conditional-registration','EC-CONDITIONAL','unrelated',CURRENT_TIMESTAMP)`);
      await f.assessment("notice-conditional", "100.00", { economicRegistrationId: "conditional-registration", taxpayerId: "unrelated" });
      await f.guide("notice-conditional-guide", "notice-conditional", "80.00", { calculationSnapshot: { conditionalPaymentOption: true, grossAmount: "100.00" } });
      await withDatabaseTransaction(connection, tx => insertDebtRegistry(tx, { entityType: "TAX_ASSESSMENT", entityId: "notice-conditional", category: "CREDIT_MOVEMENT", title: "Compensação", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "1.11" } }));
      const filter = { governmentEntityId: "ente", budgetUnitId: "ug", kind: "ECONOMIC" as const, year: 2026, taxId: "tax", taxpayerId: "unrelated", propertyId: null, economicRegistrationId: "conditional-registration", streetId: null, neighborhoodId: null, addressContains: "", minimumBalance: "0.00", overdueOnly: true };
      const debt = (await selectDebtNoticeTargets(db, actor, filter)).targets[0].debts[0];
      assert.equal(debt.balance, "98.89");
      assert.equal(debt.compensated, "1.11");
      await db.update(taxGuides).set({ calculationSnapshot: { conditionalPaymentOption: true, grossAmount: "79.99" } }).where(eq(taxGuides.id, "notice-conditional-guide"));
      await assert.rejects(selectDebtNoticeTargets(db, actor, filter), activeDebtError(/memória bruta/));
      const future = new Date(Date.now() + 86400000);
      await db.update(taxGuides).set({ dueDate: future, calculationSnapshot: { conditionalPaymentOption: true, grossAmount: "100.00" } }).where(eq(taxGuides.id, "notice-conditional-guide"));
      assert.equal((await selectDebtNoticeTargets(db, actor, filter)).targets.length, 0);
      assert.equal((await selectDebtNoticeTargets(db, actor, { ...filter, overdueOnly: false })).targets[0].debts[0].dueDate, future.toISOString().slice(0, 10));
    });

    await t.test("boleto: código registrado, centavos e DV; histórico pago não gera boleto novamente", async () => {
      const barcode = "00193373700000001000500940144816060680935031"; // Known bank boleto: R$ 1,00, DV 3.
      await db.execute(sql`INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId","updatedAt") VALUES ('slip-registration','EC-SLIP','unrelated',CURRENT_TIMESTAMP)`);
      await f.assessment("notice-slip", "1.00", { economicRegistrationId: "slip-registration", taxpayerId: "unrelated" });
      await f.guide("notice-slip-guide", "notice-slip", "1.00", { dueDate: new Date(Date.now() + 86400000), barcode, calculationSnapshot: { bankRegistration: { status: "REGISTERED", registrationId: "bank-reference" } } });
      const filter = { governmentEntityId: "ente", budgetUnitId: "ug", kind: "ECONOMIC" as const, year: 2026, taxId: "tax", taxpayerId: "unrelated", propertyId: null, economicRegistrationId: "slip-registration", streetId: null, neighborhoodId: null, addressContains: "", minimumBalance: "0.01", overdueOnly: false };
      const issue = async () => issueDebtNoticeBatch(connection, actor, { filter, expectedFingerprint: (await selectDebtNoticeTargets(db, actor, filter)).fingerprint, type: "WARNING", title: "Aviso bancário", body: "Guia registrada", legalBasis: "Lei municipal", includeBankSlip: true, reason: "Conferência bancária" });
      const valid = await issue();
      assert.equal(Buffer.from((await renderDebtNoticeOutput(db, actor, { batchId: valid.batchId, format: "PDF" })).bytes).subarray(0, 5).toString(), "%PDF-");
      const invalidDigit = barcode.slice(0, 4) + "4" + barcode.slice(5);
      await db.update(taxGuides).set({ barcode: invalidDigit }).where(eq(taxGuides.id, "notice-slip-guide"));
      const invalid = await issue();
      await assert.rejects(renderDebtNoticeOutput(db, actor, { batchId: invalid.batchId, format: "PDF" }), activeDebtError(/Dígito verificador/));
      await db.update(taxGuides).set({ barcode, totalValue: 2, totalValueDecimal: new Decimal(2) }).where(eq(taxGuides.id, "notice-slip-guide"));
      await db.update(taxAssessments).set({ originalValue: 2, originalValueDecimal: new Decimal(2), finalValueDecimal: new Decimal(2) }).where(eq(taxAssessments.id, "notice-slip"));
      const wrongAmount = await issue();
      await assert.rejects(renderDebtNoticeOutput(db, actor, { batchId: wrongAmount.batchId, format: "PDF" }), activeDebtError(/Código bancário incompatível/));
      await db.update(taxGuides).set({ status: "Paga" }).where(eq(taxGuides.id, "notice-slip-guide"));
      assert.equal(Buffer.from((await renderDebtNoticeOutput(db, actor, { batchId: wrongAmount.batchId, format: "PDF" })).bytes).subarray(0, 5).toString(), "%PDF-");
    });

    await t.test("JSON null, omissão de undefined e datas/Decimal independentes do ORM", async () => {
      assert.deepEqual(activeDebtSnapshot({ date: new Date("2026-01-01T23:59:59.999Z"), decimal: new Decimal("0.10"), omitted: undefined, array: [undefined, null] }), { date: "2026-01-01T23:59:59.999Z", decimal: "0.1", array: [null, null] });
      const row = await withDatabaseTransaction(connection, async tx => {
        const row = await insertDebtRegistry(tx, { entityType: "DEBT_NOTICE", entityId: "json-null", category: "SNAPSHOT_TEST", title: "Null JSON", data: null });
        await insertDebtAudit(tx, { action: "NULL_TEST", entityType: "DEBT_NOTICE", entityId: "json-null", authorUsuarioId: actor.usuarioId, payload: null });
        return row;
      });
      const json = await db.execute<{ registry: boolean; audit: boolean }>(sql`SELECT (SELECT data='null'::jsonb AND data IS NOT NULL FROM "TaxRegistryEntry" WHERE id=${row.id}) AS registry,(SELECT payload='null'::jsonb AND payload IS NOT NULL FROM "TaxAuditLog" WHERE action='NULL_TEST') AS audit`);
      assert.deepEqual(json.rows[0], { registry: true, audit: true });
      const bi = await tributarioBi(db, { year: 2026 });
      assert(bi.counts.assessments >= 123);
      assert(bi.paymentTrend.every(row => /^\d{4}-\d{2}$/.test(row.label)));
      assert(bi.iptuByZone.some(row => row.label === "SEM ZONA" && row.total === 100.03));
      assert(bi.iptuByUse.some(row => row.label === "SEM USO" && row.total === 100.03));
    });

    await t.test("cemitério: agendamento, finalização, transferência, replay e rollback do fato gerador", async () => {
      const defaults = await ensureS9Defaults(db, actor);
      const chapel = await createCemeteryChapel(connection, { cemeteryId: defaults.cemetery.id, name: "Capela", personTaxpayerId: "payer", responsibleTaxpayerId: "payer" });
      const lot = await createCemeteryLot(connection, actor, { cemeteryId: defaults.cemetery.id, identifier: "DA-LOT", ownerTaxpayerId: "payer", graveLimit: 2 });
      const otherLot = await createCemeteryLot(connection, actor, { cemeteryId: defaults.cemetery.id, identifier: "DA-OTHER-LOT", ownerTaxpayerId: "payer", graveLimit: 1 });
      const grave = await createGrave(connection, actor, { cemeteryId: defaults.cemetery.id, lotId: lot.id, code: "DA-1", graveType: "COVA", capacity: 1 });
      const destination = await createGrave(connection, actor, { cemeteryId: defaults.cemetery.id, lotId: otherLot.id, code: "DA-2", graveType: "COVA", capacity: 1 });
      const future = new Date(Date.now() + 86400000);
      const input = { fullName: "Titular & Histórico", deathDate: new Date("2026-01-01T12:00:00Z"), scheduledAt: future, cemeteryId: defaults.cemetery.id, graveId: grave.id, funeralHomeId: "funeraria-s9", causeId: "NATURAL", doctorName: "Médica", doctorCrm: "CRM-42", declarantTaxpayerId: "payer", deceasedTaxpayerId: "payer", chapelId: chapel.id, finalizeNow: false, requestKey: "cemetery-register" };
      // Death-cause defaults have generated IDs; lookup their physical code.
      const cause = await db.execute<{ id: string }>(sql`SELECT id FROM "TaxDeathCause" WHERE code='NATURAL'`);
      input.causeId = cause.rows[0].id;
      const deceased = await registerDeceased(connection, actor, input);
      assert.equal((await registerDeceased(connection, actor, input)).id, deceased.id);
      const process = (await db.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.deceasedId, deceased.id)))[0];
      assert.equal(process.status, "AGENDADO");
      assert.equal(process.scheduledAt.toISOString(), future.toISOString());
      assert.equal((await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, grave.id)))[0].occupantCount, 0);
      await f.database.exec(`CREATE FUNCTION fail_funeral_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='SEPULTAMENTO' THEN RAISE EXCEPTION 'funeral source rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_funeral_fact BEFORE INSERT ON "CemeteryFeeEvent" FOR EACH ROW EXECUTE FUNCTION fail_funeral_fact();`);
      try { await assert.rejects(advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "cemetery-finalize" }), activeDebtError(/funeral source rollback/)); }
      finally { await f.database.exec('DROP TRIGGER fail_funeral_fact ON "CemeteryFeeEvent"; DROP FUNCTION fail_funeral_fact();'); }
      assert.equal((await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, grave.id)))[0].occupantCount, 0);
      assert.equal((await db.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.id, process.id)))[0].status, "AGENDADO");
      assert.equal((await db.select().from(cemeteryMovements).where(eq(cemeteryMovements.deceasedId, deceased.id))).length, 0);
      await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "cemetery-finalize" });
      await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "cemetery-finalize" });
      assert.equal((await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, grave.id)))[0].occupantCount, 1);
      assert.equal((await db.select().from(cemeteryMovements).where(eq(cemeteryMovements.deceasedId, deceased.id))).length, 1);
      const move = { deceasedId: deceased.id, graveId: grave.id, toGraveId: destination.id, movementType: "OUTRO_LOTE" as const, requestKey: "cemetery-transfer" };
      assert.equal((await registerMovement(connection, actor, move)).id, (await registerMovement(connection, actor, move)).id);
      assert.equal((await db.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, deceased.id)))[0].graveId, destination.id);
      assert.equal((await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, grave.id)))[0].occupantCount, 0);
      assert.equal((await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, destination.id)))[0].occupantCount, 1);
      await assert.rejects(registerDeceased(connection, actor, { ...input, requestKey: "cemetery-invalid-date", deathDate: new Date("invalid") }), activeDebtError(/Data do óbito inválida/));
    });

    await t.test("adoção contábil: dry-run, aplicação aditiva, rollback final e replay sem nova auditoria", async () => {
      const sourceId = "p1-tce-pr-account-2026-1.0d";
      const versionId = "aurora-active-debt-accounts-2026-v1";
      const parts = [{ id: "tax_iptu", component: "05" }, { id: "tax_itbi", component: "06" }, { id: "tax_issqn", component: "07" }];
      await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('p0-current-exe','ADOPT-EXE','Executivo','PREFEITURA',CURRENT_TIMESTAMP),('p0-current-leg','ADOPT-LEG','Legislativo','CAMARA',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('adopt-exe','03.01','UG Executivo','secretaria',CURRENT_TIMESTAMP),('adopt-leg','04.01','UG Legislativo','secretaria',CURRENT_TIMESTAMP)`);
      await db.insert(planningEntityUnits).values([{ budgetUnitId: "adopt-exe", governmentEntityId: "p0-current-exe" }, { budgetUnitId: "adopt-leg", governmentEntityId: "p0-current-leg" }]);
      await db.insert(planningCatalogVersions).values({ id: sourceId, year: 2026, label: "Fonte oficial de teste", sourceHash: "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a", normativeReference: "Fonte preservada", createdById: actor.usuarioId });
      for (const part of parts) {
        await db.insert(accountingPlans).values({ id: `original-${part.id}`, code: `1.1.2.1.1.01.${part.component}.00.00.00.00.00`, name: `Direito ${part.id}`, type: "Ativo" });
        for (const code of [`1.1.2.5.1.01.${part.component}.00.00.00.00.00`, `3.6.5.1.1.01.01.${part.component}.00.00.00.00`]) await db.insert(planningCatalogEntries).values({ id: `official-${code}`, versionId: sourceId, kind: "ACCOUNT", code, name: `Conta ${code}`, degree: 12, canonicalId: `source-${code}`, attributes: { postingAllowed: true, informationNature: "P", balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } });
      }
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, sourceId));
      const run = (apply: boolean) => withDatabaseTransaction(connection, tx => adoptAuroraActiveDebtAccountsInTransaction(tx, apply), { timeoutMs: 60000 });
      const preview = await run(false);
      assert.equal(preview.mode, "READ_ONLY");
      assert.equal(preview.auditCount, 0);
      assert.equal(preview.profiles.length, 12);
      assert.equal((await db.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId))).length, 0);
      assert.equal((await db.select().from(accountingPlans)).length, 3);
      await f.database.exec(`CREATE FUNCTION fail_adoption_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ADOPT_ACTIVE_DEBT_ACCOUNTS' THEN RAISE EXCEPTION 'adoption final rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_adoption_audit BEFORE INSERT ON "FinancialAuditLog" FOR EACH ROW EXECUTE FUNCTION fail_adoption_audit();`);
      try { await assert.rejects(run(true), activeDebtError(/adoption final rollback/)); }
      finally { await f.database.exec('DROP TRIGGER fail_adoption_audit ON "FinancialAuditLog"; DROP FUNCTION fail_adoption_audit();'); }
      assert.equal((await db.select().from(accountingPlans)).length, 3);
      assert.equal((await db.select().from(accountingEvents)).length, 0);
      assert.equal((await db.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId))).length, 0);
      const applied = await run(true);
      assert.equal(applied.hash, preview.hash);
      assert.equal(applied.auditCount, 1);
      assert.equal((await run(true)).auditCount, 1);
      assert.equal((await db.select().from(accountingPlans)).length, 9);
      assert.equal((await db.select().from(accountingEvents)).length, 12);
      assert.equal((await db.select().from(accountingRules)).length, 12);
      assert.equal((await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.action, "ADOPT_ACTIVE_DEBT_ACCOUNTS"))).length, 1);
      assert.equal((await db.select().from(accountingTransactions)).length, 0, "Adoption never recognizes legacy credit or posts a second VPA");
      assert.equal((await db.select().from(accountingEntries)).length, 0);
      await assert.rejects(db.update(planningCatalogEntries).set({ name: "Tampering" }).where(eq(planningCatalogEntries.versionId, versionId)), activeDebtError(/immutable/));
      await db.update(accountingRules).set({ isReference: true }).where(eq(accountingRules.description, versionId));
      await assert.rejects(run(true), activeDebtError(/Evento municipal existente divergente/));
    });
  } finally { await f.close(); }
});

// Requires the core Tax owner to finish scope/index and the financial posting
// integration. This queue intentionally uses the same real transaction transport.
test("Dívida ativa integração: inscrição, CDA legada, extinção e pagamento na tx de origem", async () => {
  const f = await createActiveDebtDrizzleFixture();
  const { db, connection, actor } = f;
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    await f.financial();
    await f.assessment("origin");
    await f.database.exec(`CREATE FUNCTION fail_enrollment_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='INSCRICAO' THEN RAISE EXCEPTION 'source enrollment rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_enrollment_event BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_enrollment_event();`);
    try { await assert.rejects(enrollAssessmentDebt(connection, actor, "origin"), activeDebtError(/source enrollment rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_enrollment_event ON "TaxActiveDebtEvent"; DROP FUNCTION fail_enrollment_event();'); }
    assert.equal((await db.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, "origin"))).length, 0);
    assert.equal((await db.select().from(taxAssessments).where(eq(taxAssessments.id, "origin")))[0].status, "Lançado");
    const debts = await Promise.all([enrollAssessmentDebt(connection, actor, "origin"), enrollAssessmentDebt(connection, actor, "origin")]);
    assert.equal(debts[0].id, debts[1].id);
    const enrollmentAudits = await db.select().from(taxAuditLogs).where(and(eq(taxAuditLogs.entityType, "ActiveDebt"), eq(taxAuditLogs.entityId, debts[0].id), eq(taxAuditLogs.action, "CREATE")));
    assert.equal(enrollmentAudits.length, 1);
    assert.deepEqual(enrollmentAudits[0].payload, { assessmentId: "origin", value: "100.00", status: "PENDENTE_DE_VALIDACAO" });
    assert.equal((await db.select().from(debtEvents).where(eq(debtEvents.activeDebtId, debts[0].id))).length, 1);
    const debt = await issueCda(connection, actor, debts[0].id);
    assert.equal((await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, "origin"), eq(taxRegistryEntries.category, "ACCOUNTING_POSITION")))).length, 0, "Legacy credit is never recognized retroactively");
    await f.guide("origin-guide", "origin", "100.00");
    assert.equal((await issueDaGuide(connection, actor, { debtId: debt.id, dueDate: new Date("2026-01-15T00:00:00Z") })).id, "origin-guide");
    await assert.rejects(returnDebtToOrigin(connection, actor, { debtId: debt.id, reason: "Revisar origem" }), activeDebtError(/Cancele as guias/));
    await db.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, "origin-guide"));
    await f.database.exec(`CREATE FUNCTION fail_extinction_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='BAIXA_MANUAL' THEN RAISE EXCEPTION 'source extinction rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_extinction_event BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_extinction_event();`);
    try { await assert.rejects(writeOffDebt(connection, actor, { debtId: debt.id, reason: "Baixa fundamentada" }), activeDebtError(/source extinction rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_extinction_event ON "TaxActiveDebtEvent"; DROP FUNCTION fail_extinction_event();'); }
    assert.equal((await readDebt(db, debt.id)).updatedValueDecimal?.toFixed(2), "100.00");
    assert.equal((await db.select().from(taxAssessments).where(eq(taxAssessments.id, "origin")))[0].finalValueDecimal?.toFixed(2), "100.00");
    const writtenOff = await writeOffDebt(connection, actor, { debtId: debt.id, reason: "Baixa fundamentada" });
    assert.equal(writtenOff.status, "BAIXADA");
    assert.equal((await writeOffDebt(connection, actor, { debtId: debt.id, reason: "Baixa fundamentada" })).id, debt.id);
    await assert.rejects(writeOffDebt(connection, actor, { debtId: debt.id, reason: "Outra justificativa" }), activeDebtError(/outros dados/));
    await assert.rejects(settleDebtByGuide(connection, actor, { debtId: debt.id, guideId: "origin-guide", amount: 1, paymentMethod: "Manual", idempotencyKey: "extinguished-payment" }), activeDebtError(/não admite novo pagamento/));
    await f.assessment("collection", "100.03");
    const collection = await enrollAssessmentDebt(connection, actor, "collection");
    await issueCda(connection, actor, collection.id);
    await f.guide("collection-guide", "collection", "100.03");
    const payment = { debtId: collection.id, guideId: "collection-guide", amount: 0.01, paymentMethod: "Manual", idempotencyKey: "collection-first" };
    await f.database.exec(`CREATE FUNCTION fail_debt_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PAGAMENTO' THEN RAISE EXCEPTION 'payment final rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_debt_payment BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_debt_payment();`);
    try { await assert.rejects(settleDebtByGuide(connection, actor, payment), activeDebtError(/payment final rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_debt_payment ON "TaxActiveDebtEvent"; DROP FUNCTION fail_debt_payment();'); }
    assert.equal((await readDebt(db, collection.id)).updatedValueDecimal?.toFixed(2), "100.03");
    assert.equal((await db.select().from(taxPayments)).length, 0);
    assert.equal((await getBankAccountBalance(db, "debt-bank")).toFixed(2), "0.00");
    assert.equal((await settleDebtByGuide(connection, actor, payment)).updatedValueDecimal?.toFixed(2), "100.02");
    await settleDebtByGuide(connection, actor, payment);
    assert.equal((await db.select().from(taxPayments)).length, 1);
    await assert.rejects(settleDebtByGuide(connection, actor, { ...payment, amount: 0.02 }), activeDebtError(/outros dados/));
    assert.equal((await settleDebtByGuide(connection, actor, { ...payment, amount: 100.02, idempotencyKey: "collection-final" })).status, "PAGA");
    assert.equal((await getBankAccountBalance(db, "debt-bank")).toFixed(2), "100.03");
    assert.equal((await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "Revenue" WHERE "sourceModule"='TRIBUTARIO'`)).rows[0].count, 2);

    const historical = await enrollManualDebt(connection, actor, { taxpayerId: "payer", originDebtType: "Tributo DA", year: 2020, value: 1.23, sourceKey: "legacy-native-guide", budgetUnitId: "ug" });
    await issueCda(connection, actor, historical.debt.id);
    const historicalGuide = await issueDaGuide(connection, actor, { debtId: historical.debt.id, dueDate: new Date() });
    assert.equal(historicalGuide.totalValueDecimal?.toFixed(2), "1.23");
    const historicalAssessment = (await db.select().from(taxAssessments).where(eq(taxAssessments.id, historicalGuide.assessmentId)))[0];
    assert.equal(historicalAssessment.year, 2020);
    assert.equal(historicalAssessment.calculationSnapshot && typeof historicalAssessment.calculationSnapshot === "object" && !Array.isArray(historicalAssessment.calculationSnapshot) ? historicalAssessment.calculationSnapshot.recognitionPolicy : undefined, "PRESERVE_LEGACY_NO_RETROACTIVE_RECOGNITION");
    assert.equal((await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, historicalAssessment.id), eq(taxRegistryEntries.category, "ACCOUNTING_POSITION")))).length, 0);

    const defaults = await ensureS9Defaults(db, actor);
    await db.insert(taxFinancialMappings).values({ taxId: defaults.tax.id, revenueNatureId: "debt-revenue", resourceSourceId: "debt-resource", defaultBankAccountId: "debt-bank" });
    const lot = await createCemeteryLot(connection, actor, { cemeteryId: defaults.cemetery.id, identifier: "BILLING", ownerTaxpayerId: "payer", graveLimit: 1 });
    const grave = await createGrave(connection, actor, { cemeteryId: defaults.cemetery.id, lotId: lot.id, code: "BILLING", graveType: "COVA" });
    const concession = await grantConcession(connection, actor, { graveId: grave.id, holderName: "Titular", taxpayerId: "payer", concessionType: "INDETERMINADA" });
    const feeInput = { taxpayerId: "payer", amount: 12.34, dueDate: new Date(), concessionId: concession.id };
    const beforeAssessments = (await db.select({ value: count() }).from(taxAssessments))[0].value;
    await f.database.exec(`CREATE FUNCTION fail_fee_guide_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType"='TaxGuide' THEN RAISE EXCEPTION 'fee guide audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_fee_guide_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION fail_fee_guide_audit();`);
    try { await assert.rejects(issueCemeteryFee(connection, actor, feeInput), activeDebtError(/fee guide audit rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_fee_guide_audit ON "TaxAuditLog"; DROP FUNCTION fail_fee_guide_audit();'); }
    assert.equal((await db.select({ value: count() }).from(taxAssessments))[0].value, beforeAssessments);
    assert.equal((await db.select().from(cemeteryConcessions).where(eq(cemeteryConcessions.id, concession.id)))[0].feeAssessmentId, null);
    const fee = await issueCemeteryFee(connection, actor, feeInput);
    assert.equal((await issueCemeteryFee(connection, actor, feeInput)).guide.id, fee.guide.id);
    await f.database.exec(`CREATE FUNCTION fail_fee_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='INSCRICAO' THEN RAISE EXCEPTION 'fee enrollment rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_fee_enrollment BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_fee_enrollment();`);
    try { await assert.rejects(enrollCemeteryFeeInDebt(connection, actor, fee.assessment.id), activeDebtError(/fee enrollment rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_fee_enrollment ON "TaxActiveDebtEvent"; DROP FUNCTION fail_fee_enrollment();'); }
    assert.equal((await db.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, fee.assessment.id))).length, 0);
    const feeDebt = await enrollCemeteryFeeInDebt(connection, actor, fee.assessment.id);
    assert.equal((await enrollCemeteryFeeInDebt(connection, actor, fee.assessment.id)).id, feeDebt.id);
    assert.equal((await db.select().from(debtEvents).where(eq(debtEvents.activeDebtId, feeDebt.id))).length, 1);
  } finally {
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
    await f.close();
  }
});

test("Dívida ativa integração patrimonial: saldo residual, competência, devolução e extinção sem segunda VPA", async () => {
  const f = await createActiveDebtDrizzleFixture();
  const { db, connection, actor } = f;
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    const financial = await f.financial();
    const profile = { taxId: "tax", budgetUnitId: "ug", catalogVersionId: financial.catalogVersionId, effectiveFrom: financial.start, effectiveUntil: financial.end, reason: "Perfil municipal conferido", idempotencyKey: "ordinary-profile" };
    await configureTaxAccountingProfile(connection, actor, { ...profile, receivableAccountId: "ordinary", revenueAccountId: "revenue", deductionAccountId: "deduction", lossAccountId: "loss" });
    await configureTaxDebtAccountingProfile(connection, actor, { ...profile, idempotencyKey: "debt-profile", originalReceivableAccountId: "ordinary", debtReceivableAccountId: "debt", lossAccountId: "debt-loss" });
    await f.assessment("recognized", "100.03", { competence: new Date() });
    await withDatabaseTransaction(connection, tx => recognizeTaxAssessmentInTransaction(tx, actor, "recognized"));
    const debt = await enrollAssessmentDebt(connection, actor, "recognized");
    await f.database.exec(`CREATE FUNCTION fail_cda_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CDA_EMITIDA' THEN RAISE EXCEPTION 'CDA accounting rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_cda_event BEFORE INSERT ON "TaxActiveDebtEvent" FOR EACH ROW EXECUTE FUNCTION fail_cda_event();`);
    try { await assert.rejects(issueCda(connection, actor, debt.id), activeDebtError(/CDA accounting rollback/)); }
    finally { await f.database.exec('DROP TRIGGER fail_cda_event ON "TaxActiveDebtEvent"; DROP FUNCTION fail_cda_event();'); }
    assert.equal((await readDebt(db, debt.id)).cdaNumber, null);
    assert.equal((await db.select().from(cdaVersions).where(eq(cdaVersions.activeDebtId, debt.id))).length, 0);
    assert.equal((await db.select().from(accountingTransactions)).length, 1);
    assert.equal((await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "DEBT_ACCOUNTING_POSITION"))).length, 0);
    const cda = await issueCda(connection, actor, debt.id);
    assert.equal((await issueCda(connection, actor, debt.id)).cdaNumber, cda.cdaNumber);
    assert.equal((await db.select().from(accountingTransactions)).length, 2);
    await f.guide("recognized-guide", "recognized", "100.03");
    await settleDebtByGuide(connection, actor, { debtId: debt.id, guideId: "recognized-guide", amount: 0.01, paymentMethod: "Manual", idempotencyKey: "recognized-cent" });
    assert.equal((await readDebt(db, debt.id)).updatedValueDecimal?.toFixed(2), "100.02");
    assert.equal((await db.select().from(accountingEntries).where(eq(accountingEntries.accountId, "revenue"))).length, 1, "Receipt and CDA never credit a second VPA");
    await db.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, "recognized-guide"));
    const returned = await returnDebtToOrigin(connection, actor, { debtId: debt.id, reason: "Revisão na origem" });
    assert.equal(returned.status, "DEVOLVIDA");
    assert.equal((await returnDebtToOrigin(connection, actor, { debtId: debt.id, reason: "Revisão na origem" })).id, debt.id);
    const returns = await db.select().from(accountingTransactions).where(eq(accountingTransactions.sourceType, "ACTIVE_DEBT_RETURN"));
    assert.equal(returns.length, 1);
    assert((await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, returns[0].id))).every(row => row.valueDecimal?.eq("100.02")));
    assert.equal((await db.select().from(accountingEntries).where(eq(accountingEntries.accountId, "revenue"))).length, 1);

    await f.assessment("prescription", "12.34", { competence: new Date() });
    await withDatabaseTransaction(connection, tx => recognizeTaxAssessmentInTransaction(tx, actor, "prescription"));
    const prescribed = await enrollAssessmentDebt(connection, actor, "prescription");
    await issueCda(connection, actor, prescribed.id);
    const now = new Date();
    await db.insert(monthlyAccountingCloses).values({ financialYearId: "debt-year", competence: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), status: "FECHADO" });
    await assert.rejects(writeOffDebt(connection, actor, { debtId: prescribed.id, reason: "Extinção conferida" }), activeDebtError(/competencia contabil nao esta aberta/));
    assert.equal((await readDebt(db, prescribed.id)).updatedValueDecimal?.toFixed(2), "12.34");
    await db.update(monthlyAccountingCloses).set({ status: "ABERTO" }).where(eq(monthlyAccountingCloses.financialYearId, "debt-year"));
    const old = new Date(); old.setUTCFullYear(old.getUTCFullYear() - 6);
    await db.update(taxActiveDebts).set({ createdAt: old }).where(eq(taxActiveDebts.id, prescribed.id));
    assert.equal((await runPrescription(connection, actor, 5)).count, 1);
    assert.equal((await readDebt(db, prescribed.id)).status, "BAIXADA_PRESCRICAO");
    assert.equal((await runPrescription(connection, actor, 5)).count, 0);
    const losses = await db.select().from(accountingEntries).where(eq(accountingEntries.accountId, "debt-loss"));
    assert.equal(losses.length, 1);
    assert.equal(losses[0].valueDecimal?.toFixed(2), "12.34");

    await f.assessment("residual", "100.03", { competence: new Date() });
    await withDatabaseTransaction(connection, tx => recognizeTaxAssessmentInTransaction(tx, actor, "residual"));
    await f.guide("residual-guide", "residual", "100.03");
    await db.insert(taxPayments).values({ guideId: "residual-guide", amountPaid: 0.01, amountPaidDecimal: new Decimal("0.01"), paymentDate: new Date(), paymentMethod: "Manual" });
    await withDatabaseTransaction(connection, tx => insertDebtRegistry(tx, { entityType: "TAX_ASSESSMENT", entityId: "residual", category: "CREDIT_MOVEMENT", title: "Compensação anterior à CDA", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "0.02" } }));
    const residual = await enrollAssessmentDebt(connection, actor, "residual");
    assert.equal(residual.originalValueDecimal?.toFixed(2), "100.00");
    await issueCda(connection, actor, residual.id);
    const reclassification = (await db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "ACTIVE_DEBT_RECLASSIFICATION"), eq(accountingTransactions.sourceId, "residual"))))[0];
    const reclassifiedLines = await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, reclassification.id));
    assert.equal(reclassifiedLines.length, 2);
    assert(reclassifiedLines.every(row => row.valueDecimal?.eq("100.00")));
    assert.equal((await db.select().from(accountingEntries).where(eq(accountingEntries.accountId, "revenue"))).length, 3, "CDA reclassifies the residual without another VPA");
  } finally {
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
    await f.close();
  }
});
