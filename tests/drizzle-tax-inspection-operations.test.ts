import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inspectionActivities, inspectionCredentialEvents, inspectionCredentials, inspectionDeclarations, inspectionDeductionConsumptions, inspectionDeductionCredits, inspectionDmsDeclarations, inspectionOccasionalRequests, inspectionRpsBatches, inspectionRpsItems } from "../src/db/schema/tax-inspection-operations";
import { nfseCorrectionLetters, nfseEvents, nfseInvoiceData, taxInvoices } from "../src/db/schema/taxation-nfse";
import { economicRegistrations, taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxActiveDebts, taxFinancialMappings, taxPayments } from "../src/db/schema/tax-accounting";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { pageParameters } from "../src/db/schema/taxation-pages";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { accountingEntries, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { planningEntityUnits } from "../src/db/schema/planning-catalog";
import { createInspectionOperationsFixture, inspectionError } from "../src/db/repositories/tax-inspection-operations/test-fixture";
import { inspectionProviderActivities, inspectionServiceTaxes, nextInspectionNumber } from "../src/db/repositories/tax-inspection-operations/records";
import { inspectionSnapshot } from "../src/db/repositories/tax-inspection-operations/snapshot";
import { approveOccasionalRequest, cancelNfse, createCorrectionLetter, createDeductionCredit, createDmsDeclaration, createOccasionalRequest, createOccasionalRequestInTransaction, decideNfseCredential, emitNfse, receiveRpsBatch, releaseOccasionalRequest, requestNfseCredential, substituteNfse, updateRpsItem } from "../src/lib/tributacao/s4-service";
import { configureTaxAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";

const now = new Date("2026-09-15T12:00:00.000Z");
const emission = { providerId: "s4-provider", takerId: "s4-taker", economicRegistrationId: "s4-registration", serviceActivityId: "s4-activity", competence: "09/2026", serviceDescription: "Serviço documentado", serviceValue: "100.00", retained: false };
const occasional = { providerTaxpayerId: "s4-provider", takerTaxpayerId: "s4-taker", serviceActivityId: "s4-activity", serviceDescription: "Serviço avulso", serviceValue: 100, deductions: 0, paymentRequired: false };
const manualDms = { taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", competence: "09/2026", direction: "PRESTADO", channel: "WEB", detailMode: "DOCUMENTO", noMovement: false, serviceValue: 100.01, deductions: 0.01, ownIss: 5.12, retainedIss: 0 };

test("S4: núcleo RPS, créditos e numeração sobre todo o SQL histórico", async t => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const f = await createInspectionOperationsFixture();
  const { db, connection, actor } = f;
  try {
    assert.equal(f.migrationCount, 156);
    await t.test("RPS preserva JSON null, Decimal, datas e replay concorrente sem duplicação", async () => {
      const input = { batchNumber: "S4-RPS-1", providerTaxpayerId: "s4-provider", source: "UPLOAD" as const, items: [{ rpsNumber: "1", payload: null }, { rpsNumber: "2", payload: { exact: new Decimal("1234567890123456.78"), utc: new Date("2027-01-01T00:00:00.001Z"), absent: undefined, nullable: null, values: [undefined, 0.1] } }] };
      const [first, replay] = await Promise.all([receiveRpsBatch(connection, actor, input), receiveRpsBatch(connection, actor, input)]);
      assert.equal(first.id, replay.id);
      assert.equal(first.signaturePolicy, "INTERNAL_ALLOWED");
      assert.equal(first.signatureStatus, "NAO_EXIGIDA");
      assert.equal((await db.select().from(inspectionRpsBatches)).length, 1);
      const items = await db.select().from(inspectionRpsItems).where(eq(inspectionRpsItems.batchId, first.id)).orderBy(inspectionRpsItems.rpsNumber);
      assert.equal(items.length, 2);
      assert.equal(items[0].payload, null);
      assert.deepEqual(items[1].payload, { exact: "1234567890123456.78", utc: "2027-01-01T00:00:00.001Z", nullable: null, values: [null, 0.1] });
      const [nullKind] = await db.select({ sqlNull: sql<boolean>`${inspectionRpsItems.payload} IS NULL`, type: sql<string>`jsonb_typeof(${inspectionRpsItems.payload})` }).from(inspectionRpsItems).where(eq(inspectionRpsItems.id, items[0].id));
      assert.deepEqual(nullKind, { sqlNull: false, type: "null" });
      await assert.rejects(receiveRpsBatch(connection, actor, { ...input, source: "WEBSERVICE" }), inspectionError(/conteúdo diferente/));
      await assert.rejects(receiveRpsBatch(connection, { ...actor, allowedBudgetUnitIds: [] }, input), inspectionError(/autorizada/));
      await assert.rejects(receiveRpsBatch(connection, actor, { ...input, items: [] }), inspectionError(/ao menos/));
      const api = await receiveRpsBatch(connection, null, { batchNumber: "S4-API", providerTaxpayerId: "s4-other-provider", source: "WEBSERVICE", items: [{ rpsNumber: "API-1", payload: {} }] });
      assert.equal(api.createdByUsuarioId, null);
    });

    await t.test("falha em item desfaz lote e itens; RPS só admite transição na origem recebida", async () => {
      await assert.rejects(receiveRpsBatch(connection, actor, { batchNumber: "S4-ROLLBACK", providerTaxpayerId: "s4-provider", source: "UPLOAD", items: [{ rpsNumber: "same", payload: {} }, { rpsNumber: "same", payload: {} }] }));
      assert.equal((await db.select().from(inspectionRpsBatches).where(eq(inspectionRpsBatches.batchNumber, "S4-ROLLBACK"))).length, 0);
      const batch = await receiveRpsBatch(connection, actor, { batchNumber: "S4-TRANSITION", providerTaxpayerId: "s4-provider", source: "UPLOAD", items: [{ rpsNumber: "cancel", payload: {} }, { rpsNumber: "replace", payload: {} }, { rpsNumber: "converted", payload: {} }] });
      const items = await db.select().from(inspectionRpsItems).where(eq(inspectionRpsItems.batchId, batch.id));
      const cancel = items.find(item => item.rpsNumber === "cancel")!;
      const replace = items.find(item => item.rpsNumber === "replace")!;
      const converted = items.find(item => item.rpsNumber === "converted")!;
      await assert.rejects(updateRpsItem(connection, { id: cancel.id, action: "CANCELAR" }, { ...actor, allowedBudgetUnitIds: [] }), inspectionError(/autorizada/));
      assert.equal((await updateRpsItem(connection, { id: cancel.id, action: "CANCELAR" }, actor)).cancelledAt?.toISOString(), now.toISOString());
      await assert.rejects(updateRpsItem(connection, { id: cancel.id, action: "CANCELAR" }, actor), inspectionError(/origem/));
      await assert.rejects(updateRpsItem(connection, { id: replace.id, action: "SUBSTITUIR", replacedRpsNumber: "replace" }, actor), inspectionError(/si próprio/));
      assert.equal((await updateRpsItem(connection, { id: replace.id, action: "SUBSTITUIR", replacedRpsNumber: "next" }, actor)).replacedRpsNumber, "next");
      await db.update(inspectionRpsItems).set({ status: "CONVERTIDO" }).where(eq(inspectionRpsItems.id, converted.id));
      await assert.rejects(updateRpsItem(connection, { id: converted.id, action: "CANCELAR" }, actor), inspectionError(/origem/));
    });

    await t.test("crédito mantém precisão e origem única e participa da transação recebida", async () => {
      const input = { taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", creditType: "MATERIAIS", originDocument: "S4-CREDIT", constructionReference: "Obra 1", amount: 10.235 };
      const credit = await createDeductionCredit(db, actor, input);
      assert.equal(credit.originalAmountDecimal.toFixed(2), "10.24");
      assert.equal(credit.availableAmountDecimal.toFixed(2), "10.24");
      await assert.rejects(createDeductionCredit(db, actor, input));
      for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(createDeductionCredit(db, actor, { ...input, originDocument: String(amount), amount }), inspectionError(/finito/));
      await assert.rejects(createDeductionCredit(db, { ...actor, allowedBudgetUnitIds: [] }, { ...input, originDocument: "DENIED" }), inspectionError(/autorizada/));
      await assert.rejects(withDatabaseTransaction(connection, async tx => { await createDeductionCredit(tx, actor, { ...input, originDocument: "S4-TX-ROLLBACK" }); throw new Error("rollback crédito origem"); }), /rollback crédito origem/);
      assert.equal((await db.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.originDocument, "S4-TX-ROLLBACK"))).length, 0);
    });

    await t.test("consultas de credenciamento/tributo respeitam UG vazia, inscrição e atividades ativas", async () => {
      assert.equal((await inspectionProviderActivities(db, "s4-provider", [], "s4-registration")).length, 0);
      assert.equal((await inspectionProviderActivities(db, "s4-provider", ["s4-ug"], "s4-other-registration")).length, 0);
      assert.equal((await inspectionProviderActivities(db, "s4-provider", ["s4-other-ug"])).length, 0);
      assert.equal((await inspectionProviderActivities(db, "s4-provider", ["s4-ug"], "s4-registration")).length, 1);
      assert.equal((await inspectionServiceTaxes(db, [])).length, 0);
      assert.deepEqual(await inspectionServiceTaxes(db, ["s4-ug"]), [{ id: "s4-tax" }]);
      assert.equal((await inspectionServiceTaxes(db)).length, 2);
    });

    await t.test("numeração anual é atômica, reverte no rollback e separa tipos", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => { assert.equal(await nextInspectionNumber(tx, "S4_SEQUENCE", "S4"), "S4-2026-0000001"); throw new Error("rollback sequência"); }), /rollback sequência/);
      const numbers = await Promise.all([1, 2].map(() => withDatabaseTransaction(connection, tx => nextInspectionNumber(tx, "S4_SEQUENCE", "S4"))));
      assert.deepEqual(numbers.sort(), ["S4-2026-0000001", "S4-2026-0000002"]);
      assert.equal(await withDatabaseTransaction(connection, tx => nextInspectionNumber(tx, "S4_OTHER_SEQUENCE", "S4")), "S4-2026-0000001");
      assert.deepEqual(inspectionSnapshot({ amount: new Decimal("0.10"), nullable: null, utc: now }), { amount: "0.1", nullable: null, utc: now.toISOString() });
    });
  } finally { await f.close(); }
});

test("S4 integração: credenciamento, NFS-e, DMS e avulsa na transação de origem", async t => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const f = await createInspectionOperationsFixture();
  const { db, connection, actor } = f;
  try {
    await t.test("solicitação e decisão mantêm termos, escopo e eventos atômicos", async () => {
      const input = { taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", serviceActivityId: "s4-activity" };
      await assert.rejects(requestNfseCredential(connection, { ...actor, allowedBudgetUnitIds: [] }, input), inspectionError(/autorizadas/));
      await assert.rejects(requestNfseCredential(connection, actor, { ...input, economicRegistrationId: "s4-other-registration" }), inspectionError(/inválidos/));
      const credential = await requestNfseCredential(connection, actor, input);
      assert.equal(credential.termsVersion, "DEMO-1");
      assert.equal(credential.termsAcceptedAt.toISOString(), now.toISOString());
      await f.database.exec(`CREATE FUNCTION s4_fail_credential_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 's4 credential event rollback'; END $$; CREATE TRIGGER s4_fail_credential_event BEFORE INSERT ON "NfseCredentialEvent" FOR EACH ROW EXECUTE FUNCTION s4_fail_credential_event();`);
      try {
        await assert.rejects(decideNfseCredential(connection, actor, { id: credential.id, approved: true, reason: "Conferido" }), inspectionError(/s4 credential event rollback/));
        await assert.rejects(requestNfseCredential(connection, actor, input), inspectionError(/s4 credential event rollback/));
      } finally { await f.database.exec('DROP TRIGGER s4_fail_credential_event ON "NfseCredentialEvent"; DROP FUNCTION s4_fail_credential_event();'); }
      assert.equal((await db.select().from(inspectionCredentials)).length, 2);
      assert.equal((await db.select().from(inspectionCredentials).where(eq(inspectionCredentials.id, credential.id)))[0].status, "SOLICITADO");
      const enabled = await decideNfseCredential(connection, actor, { id: credential.id, approved: true, reason: "Conferido" });
      assert.equal(enabled.enabledAt?.toISOString(), now.toISOString());
      assert.equal(enabled.analyzedByUsuarioId, actor.usuarioId);
      assert.equal((await db.select().from(inspectionCredentialEvents).where(eq(inspectionCredentialEvents.credentialId, credential.id))).length, 2);
      await assert.rejects(decideNfseCredential(connection, actor, { id: credential.id, approved: false, reason: "Outro" }), inspectionError(/análise/));
      const denied = await requestNfseCredential(connection, actor, input);
      assert.equal((await decideNfseCredential(connection, actor, { id: denied.id, approved: false, reason: "Insuficiente" })).enabledAt, null);
    });

    await t.test("emissão de ISS zero conserva UTC, floats, snapshots e escrita prestado/tomado", async () => {
      const invoice = await emitNfse(connection, actor, { ...emission, serviceValue: "0.10", manualDeductions: "0.10", serviceLocation: "Local" });
      const [data] = await db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id));
      assert.equal(invoice.serviceValue, 0.1);
      assert.equal(invoice.serviceValueDecimal?.toFixed(2), "0.10");
      assert.equal(invoice.issValueDecimal?.toFixed(2), "0.00");
      assert.equal(data.rate.toFixed(6), "5.123456");
      assert.equal(data.authenticityUrl, `/portal/nfse/${invoice.verificationCode}`);
      const memory = taxScopeSnapshot(data.calculationSnapshot);
      assert.equal(memory.cancellationDays, 7);
      assert.equal(memory.cancellationDaysEstimated, false);
      assert.equal(memory.budgetUnitId, "s4-ug");
      assert.equal(memory.rate, "5.123456");
      const [declaration] = await db.select().from(inspectionDeclarations).where(sql`${inspectionDeclarations.calculationSnapshot}->>'invoiceId'=${invoice.id}`);
      assert.equal(declaration.competence.toISOString(), "2026-09-01T12:00:00.000Z");
      const writing = await db.select().from(inspectionDmsDeclarations).where(sql`${inspectionDmsDeclarations.payload}->>'invoiceId'=${invoice.id}`);
      assert.deepEqual(writing.map(row => row.direction).sort(), ["PRESTADOS", "TOMADOS"]);
      const before = (await db.select({ total: count() }).from(taxInvoices))[0].total;
      await assert.rejects(emitNfse(connection, actor, { ...emission, serviceValue: "0.10", manualDeductions: "0.10", retained: true, takerId: undefined }), inspectionError(/tomador identificado/));
      assert.equal((await db.select({ total: count() }).from(taxInvoices))[0].total, before);
      await assert.rejects(emitNfse(connection, actor, { ...emission, competence: "13/2026" }), inspectionError(/MM\/AAAA/));
      await assert.rejects(emitNfse(connection, actor, { ...emission, occasionalRequestId: "forged" }), inspectionError(/origem/));
    });

    await t.test("carta e evento revertem juntos; campos fiscais e escopo são protegidos", async () => {
      const invoice = await emitNfse(connection, actor, { ...emission, manualDeductions: "100" });
      const input = { invoiceId: invoice.id, reason: "Correção fundamentada", changes: { serviceDescription: "Descrição corrigida", contactEmail: "fiscal@example.invalid" } };
      await assert.rejects(createCorrectionLetter(connection, actor, { ...input, changes: { rate: "1" } }), inspectionError(/não pode alterar/));
      await assert.rejects(createCorrectionLetter(connection, { ...actor, allowedBudgetUnitIds: [] }, input), inspectionError(/autorizadas/));
      await f.database.exec(`CREATE FUNCTION s4_fail_correction_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CARTA_CORRECAO' THEN RAISE EXCEPTION 's4 correction rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER s4_fail_correction_event BEFORE INSERT ON "NfseEvent" FOR EACH ROW EXECUTE FUNCTION s4_fail_correction_event();`);
      try { await assert.rejects(createCorrectionLetter(connection, actor, input), inspectionError(/s4 correction rollback/)); }
      finally { await f.database.exec('DROP TRIGGER s4_fail_correction_event ON "NfseEvent"; DROP FUNCTION s4_fail_correction_event();'); }
      assert.equal((await db.select().from(nfseCorrectionLetters).where(eq(nfseCorrectionLetters.invoiceId, invoice.id))).length, 0);
      const letter = await createCorrectionLetter(connection, actor, input);
      assert.deepEqual(letter.changes, input.changes);
      assert.equal((await db.select().from(nfseEvents).where(and(eq(nfseEvents.invoiceId, invoice.id), eq(nfseEvents.eventType, "CARTA_CORRECAO")))).length, 1);
      assert.equal((await db.select().from(taxInvoices).where(eq(taxInvoices.id, invoice.id)))[0].serviceValueDecimal?.toFixed(2), "100.00");
    });

    await t.test("DMS manual protege identidade, UG, origem automática e rollback da retificação", async () => {
      await assert.rejects(createDmsDeclaration(connection, { ...actor, allowedBudgetUnitIds: [] }, manualDms), inspectionError(/tributo de serviço único/));
      await assert.rejects(createDmsDeclaration(connection, null, manualDms), inspectionError(/tributo de serviço único/));
      const original = await createDmsDeclaration(connection, actor, manualDms);
      assert.equal(original.direction, "PRESTADOS");
      assert.equal(original.serviceValueDecimal.toFixed(2), "100.01");
      await assert.rejects(createDmsDeclaration(connection, actor, { ...manualDms, rectifiesDeclarationId: original.id, payload: { automatic: true } }), inspectionError(/Origem automática/));
      assert.equal((await db.select().from(inspectionDmsDeclarations).where(eq(inspectionDmsDeclarations.id, original.id)))[0].status, "PROTOCOLADA");
      await assert.rejects(createDmsDeclaration(connection, actor, { ...manualDms, rectifiesDeclarationId: original.id, competence: "10/2026" }), inspectionError(/identidade/));
      const attempts = await Promise.allSettled([1, 2].map(() => createDmsDeclaration(connection, actor, { ...manualDms, rectifiesDeclarationId: original.id })));
      assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
      assert.equal((await db.select().from(inspectionDmsDeclarations).where(eq(inspectionDmsDeclarations.rectifiesDeclarationId, original.id))).length, 1);
      for (const invalid of [{ noMovement: true }, { deductions: 101 }, { ownIss: Number.NaN }, { payload: { invoiceId: "forged" } }, { channel: "NFSE_AUTOMATICA" }]) await assert.rejects(createDmsDeclaration(connection, actor, { ...manualDms, ...invalid }));
      await db.update(inspectionActivities).set({ isActive: false }).where(eq(inspectionActivities.id, "s4-other-activity"));
      try {
        const api = await createDmsDeclaration(connection, null, { ...manualDms, direction: "TOMADO", channel: "WEBSERVICE", noMovement: true, serviceValue: 0, deductions: 0, ownIss: 0 });
        assert.equal(api.direction, "TOMADOS");
        assert.equal(api.createdByUsuarioId, null);
      } finally { await db.update(inspectionActivities).set({ isActive: true }).where(eq(inspectionActivities.id, "s4-other-activity")); }
    });

    await t.test("avulsa participa da tx do portal, mantém sequência e valida alíquota na aprovação", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => { await createOccasionalRequestInTransaction(tx, actor, occasional); throw new Error("rollback portal origem"); }), /rollback portal origem/);
      assert.equal((await db.select().from(inspectionOccasionalRequests)).length, 0);
      const request = await createOccasionalRequest(connection, actor, occasional);
      assert.equal(request.requestNumber, "NSA-2026-0000001");
      assert.equal(request.taxAmountDecimal.toFixed(2), "5.12");
      await db.update(inspectionActivities).set({ issRate: new Decimal("6") }).where(eq(inspectionActivities.id, "s4-activity"));
      try { await assert.rejects(approveOccasionalRequest(connection, actor, request.id), inspectionError(/Alíquota mudou/)); }
      finally { await db.update(inspectionActivities).set({ issRate: new Decimal("5.123456") }).where(eq(inspectionActivities.id, "s4-activity")); }
      const approved = await approveOccasionalRequest(connection, actor, request.id);
      assert.equal(approved.status, "APROVADA");
      assert.equal((await approveOccasionalRequest(connection, actor, request.id)).assessmentId, approved.assessmentId);
      await f.database.exec(`CREATE FUNCTION s4_fail_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.channel='NFSE_AUTOMATICA' THEN RAISE EXCEPTION 's4 release rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER s4_fail_release BEFORE INSERT ON "NfseDmsDeclaration" FOR EACH ROW EXECUTE FUNCTION s4_fail_release();`);
      const before = (await db.select({ total: count() }).from(taxInvoices))[0].total;
      try { await assert.rejects(releaseOccasionalRequest(connection, actor, request.id, "s4-registration"), inspectionError(/s4 release rollback/)); }
      finally { await f.database.exec('DROP TRIGGER s4_fail_release ON "NfseDmsDeclaration"; DROP FUNCTION s4_fail_release();'); }
      assert.equal((await db.select({ total: count() }).from(taxInvoices))[0].total, before);
      assert.equal((await db.select().from(inspectionOccasionalRequests).where(eq(inspectionOccasionalRequests.id, request.id)))[0].invoiceId, null);
      const [invoice, replay] = await Promise.all([releaseOccasionalRequest(connection, actor, request.id, "s4-registration"), releaseOccasionalRequest(connection, actor, request.id, "s4-registration")]);
      assert.equal(invoice.id, replay.id);
      assert.equal((await db.select().from(taxAssessments)).length, 1);
      await assert.rejects(releaseOccasionalRequest(connection, actor, request.id, "s4-other-registration"), inspectionError(/outra inscrição/));
      await assert.rejects(cancelNfse(connection, actor, { invoiceId: invoice.id, reason: "Teste origem" }), inspectionError(/nota avulsa/));
    });

    await t.test("liberação avulsa exige somatório Decimal integral confirmado", async () => {
      const request = await createOccasionalRequest(connection, actor, { ...occasional, paymentRequired: true });
      const approved = await approveOccasionalRequest(connection, actor, request.id);
      assert(approved.guideId && approved.assessmentId);
      await assert.rejects(releaseOccasionalRequest(connection, actor, request.id, "s4-registration"), inspectionError(/pagamento Decimal integral/));
      const [payment] = await db.insert(taxPayments).values({ guideId: approved.guideId, amountPaid: 5.12, amountPaidDecimal: null, paymentDate: now, paymentMethod: "Manual", status: "Confirmado" }).returning();
      await assert.rejects(releaseOccasionalRequest(connection, actor, request.id, "s4-registration"), inspectionError(/pagamento Decimal integral/));
      await db.update(taxPayments).set({ amountPaidDecimal: new Decimal("5.11") }).where(eq(taxPayments.id, payment.id));
      await assert.rejects(releaseOccasionalRequest(connection, actor, request.id, "s4-registration"), inspectionError(/pagamento Decimal integral/));
      await db.insert(taxPayments).values({ guideId: approved.guideId, amountPaid: 0.01, amountPaidDecimal: new Decimal("0.01"), paymentDate: now, paymentMethod: "Manual", status: "Confirmado" });
      const invoice = await releaseOccasionalRequest(connection, actor, request.id, "s4-registration");
      assert.equal(invoice.issValueDecimal?.toFixed(2), "5.12");
      assert.equal((await db.select().from(taxGuides).where(eq(taxGuides.id, approved.guideId))).length, 1);
    });
  } finally { await f.close(); }
});

test("S4 integração patrimonial: substituição, extinção, competência e auditoria atômicas", async t => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const f = await createInspectionOperationsFixture();
  const { db, connection, actor } = f;
  try {
    await configureTaxAccountingProfile(connection, actor, await f.accounting());
    await t.test("guardas de emissão não deixam nota, consumo ou reconhecimento parcial", async () => {
      const credit = await createDeductionCredit(db, actor, { taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", creditType: "MATERIAIS", originDocument: "S4-GUARD-CREDIT", amount: 1 });
      const usages = [{ creditId: credit.id, amount: "0.50" }];
      for (const input of [
        { ...emission, creditUsages: [...usages, ...usages] },
        { ...emission, creditUsages: [{ creditId: credit.id, amount: "1.01" }] },
        { ...emission, manualDeductions: "-0.01" },
        { ...emission, manualDeductions: "101" },
        { ...emission, takerId: "absent" },
        { ...emission, economicRegistrationId: "s4-other-registration" },
      ]) await assert.rejects(emitNfse(connection, actor, input));
      assert.equal((await db.select().from(taxInvoices)).length, 0);
      assert.equal((await db.select().from(accountingTransactions)).length, 0);
      assert.equal((await db.select().from(inspectionDeductionConsumptions)).length, 0);
      const enabled = await db.select().from(inspectionCredentials);
      await db.update(inspectionCredentials).set({ status: "REJEITADO" });
      try { await assert.rejects(emitNfse(connection, actor, emission), inspectionError(/credenciamento habilitado/)); }
      finally { for (const item of enabled) await db.update(inspectionCredentials).set({ status: item.status }).where(eq(inspectionCredentials.id, item.id)); }
    });

    await t.test("emissão, consumo e substituição congelam memória e revertem falha tardia", async () => {
      const credit = await createDeductionCredit(db, actor, { taxpayerId: "s4-provider", economicRegistrationId: "s4-registration", creditType: "MATERIAIS", originDocument: "S4-FIN-CREDIT", amount: 10 });
      const invoice = await emitNfse(connection, actor, { ...emission, manualDeductions: "10", creditUsages: [{ creditId: credit.id, amount: "10" }] });
      const [data] = await db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id));
      const snapshot = structuredClone(data.calculationSnapshot);
      assert.equal(invoice.issValueDecimal?.toFixed(2), "4.10");
      assert.equal((await db.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.id, credit.id)))[0].availableAmountDecimal.toFixed(2), "0.00");
      const original = (await db.select().from(taxAssessments).where(sql`${taxAssessments.calculationSnapshot}->>'invoiceId'=${invoice.id}`))[0];
      assert(original.finalValueDecimal?.eq("4.10"));
      const replacement = { invoiceId: invoice.id, reason: "Substituição conferida", serviceDescription: "Serviço corrigido", serviceValue: 120, deductions: 0, retained: false };
      const auditCount = (await db.select({ total: count() }).from(taxAuditLogs))[0].total;
      await db.update(inspectionActivities).set({ issRate: new Decimal("9") }).where(eq(inspectionActivities.id, "s4-activity"));
      await f.database.exec(`CREATE FUNCTION s4_fail_substitution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='SUBSTITUIDA' THEN RAISE EXCEPTION 's4 substitution rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER s4_fail_substitution BEFORE INSERT ON "NfseEvent" FOR EACH ROW EXECUTE FUNCTION s4_fail_substitution();`);
      try { await assert.rejects(substituteNfse(connection, actor, replacement), inspectionError(/s4 substitution rollback/)); }
      finally { await f.database.exec('DROP TRIGGER s4_fail_substitution ON "NfseEvent"; DROP FUNCTION s4_fail_substitution();'); }
      assert.equal((await db.select().from(taxAssessments).where(eq(taxAssessments.id, original.id)))[0].status, original.status);
      assert.equal((await db.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.id, credit.id)))[0].availableAmountDecimal.toFixed(2), "0.00");
      assert.equal((await db.select().from(accountingTransactions)).length, 1);
      assert.equal((await db.select({ total: count() }).from(taxAuditLogs))[0].total, auditCount);
      const [created, replay] = await Promise.all([substituteNfse(connection, actor, replacement), substituteNfse(connection, actor, replacement)]);
      assert.equal(created.id, replay.id);
      assert.equal(created.issValueDecimal?.toFixed(2), "6.15");
      assert.deepEqual((await db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id)))[0].calculationSnapshot, snapshot);
      assert.equal((await db.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.id, credit.id)))[0].availableAmountDecimal.toFixed(2), "10.00");
      assert.equal((await db.select().from(inspectionDeductionConsumptions).where(eq(inspectionDeductionConsumptions.invoiceId, invoice.id))).length, 1);
      assert.equal((await db.select().from(accountingTransactions)).length, 3);
      await assert.rejects(substituteNfse(connection, actor, { ...replacement, serviceValue: 121 }), inspectionError(/outros dados/));
      await db.update(inspectionActivities).set({ issRate: new Decimal("5.123456") }).where(eq(inspectionActivities.id, "s4-activity"));
      await Promise.all([1, 2].map(() => cancelNfse(connection, actor, { invoiceId: created.id, reason: "Extinção conferida" })));
      assert.equal((await db.select().from(accountingTransactions)).length, 4);
      const entries = await db.select().from(accountingEntries);
      assert.equal(entries.filter(row => row.accountId === "s4-vpa" && row.type === "Crédito").length, 2);
      assert(entries.every(row => row.valueDecimal?.isFinite() && taxScopeSnapshot(row.classificationSnapshot).canonicalId === row.accountId));
      const audits = await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "CREDIT_EVENT"), inArray(taxRegistryEntries.entityId, [original.id, (await db.select().from(taxAssessments).where(sql`${taxAssessments.calculationSnapshot}->>'invoiceId'=${created.id}`))[0].id])));
      assert.equal(audits.length, 2);
      assert(audits.every(row => taxScopeSnapshot(row.data).operationFinancialYearId === "s4-year"));
    });

    await t.test("retenção constitui débito no tomador; período fechado reverte alteração fiscal", async () => {
      const invoice = await emitNfse(connection, actor, { ...emission, retained: true });
      const [assessment] = await db.select().from(taxAssessments).where(sql`${taxAssessments.calculationSnapshot}->>'invoiceId'=${invoice.id}`);
      assert.equal(assessment.taxpayerId, "s4-taker");
      assert.equal(assessment.economicRegistrationId, null);
      const [data] = await db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id));
      assert.equal(data.ownIssDecimal.toFixed(2), "0.00");
      assert.equal(data.retainedIssDecimal.toFixed(2), "5.12");
      const [closed] = await db.insert(monthlyAccountingCloses).values({ financialYearId: "s4-year", competence: new Date("2026-09-01T00:00:00Z"), status: "FECHADO" }).returning();
      try { await assert.rejects(cancelNfse(connection, actor, { invoiceId: invoice.id, reason: "Período fechado" }), inspectionError(/compet[eê]ncia cont[aá]bil.*aberta/i)); }
      finally { await db.delete(monthlyAccountingCloses).where(eq(monthlyAccountingCloses.id, closed.id)); }
      assert.equal((await db.select().from(taxInvoices).where(eq(taxInvoices.id, invoice.id)))[0].status, "Emitida");
      await cancelNfse(connection, actor, { invoiceId: invoice.id, reason: "Período aberto" });
      assert.equal((await db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id)))[0].finalValueDecimal?.toFixed(2), "0.00");
    });

    await t.test("prazo histórico, aprovação, UG/ente e vigência do parâmetro são preservados", async () => {
      const invoice = await emitNfse(connection, actor, { ...emission, manualDeductions: "100" });
      await db.update(taxInvoices).set({ createdAt: new Date(now.getTime() - 8 * 86400000) }).where(eq(taxInvoices.id, invoice.id));
      await db.execute(sql`UPDATE "TaxParameter" SET configuration='{"nfseCancellationDays":3650}'::jsonb WHERE id='s4-parameter'`);
      const input = { invoiceId: invoice.id, reason: "Prazo histórico" };
      assert.deepEqual(await cancelNfse(connection, actor, input), { status: "Cancelamento pendente", automatic: false });
      await assert.rejects(cancelNfse(connection, { ...actor, allowedBudgetUnitIds: [] }, { ...input, approve: true }), inspectionError(/autorizadas/));
      await db.update(planningEntityUnits).set({ governmentEntityId: "s4-other-ente" }).where(eq(planningEntityUnits.budgetUnitId, "s4-ug"));
      try { await assert.rejects(cancelNfse(connection, actor, { ...input, approve: true }), inspectionError(/entidade atual/)); }
      finally { await db.update(planningEntityUnits).set({ governmentEntityId: "s4-ente" }).where(eq(planningEntityUnits.budgetUnitId, "s4-ug")); }
      assert.deepEqual(await cancelNfse(connection, actor, { ...input, approve: true }), { status: "Cancelada", automatic: false });
      assert.deepEqual(await cancelNfse(connection, actor, input), { status: "Cancelada", automatic: false });
      await assert.rejects(cancelNfse(connection, actor, { ...input, reason: "Outro motivo" }), inspectionError(/outro fundamento/));
      await assert.rejects(emitNfse(connection, actor, { ...emission, competence: "01/2027" }), inspectionError(/parâmetro fiscal ativo/));
      await db.update(pageParameters).set({ configuration: { nfseCancellationDays: -1 } }).where(eq(pageParameters.id, "s4-parameter"));
      await assert.rejects(emitNfse(connection, actor, emission), inspectionError(/Prazo de cancelamento/));
      await db.update(pageParameters).set({ configuration: { nfseCancellationDays: 7 } }).where(eq(pageParameters.id, "s4-parameter"));
    });

    await t.test("arrecadação, dívida ativa e compensação impedem extinção fiscal", async () => {
      for (const guard of ["payment", "debt", "compensation"] as const) {
        const invoice = await emitNfse(connection, actor, emission);
        const [assessment] = await db.select().from(taxAssessments).where(sql`${taxAssessments.calculationSnapshot}->>'invoiceId'=${invoice.id}`);
        if (guard === "payment") {
          const guide = await f.guide("s4-guard-guide", assessment.id);
          await db.insert(taxPayments).values({ guideId: guide.id, amountPaid: 0.01, amountPaidDecimal: new Decimal("0.01"), paymentDate: now, paymentMethod: "Manual", status: "Confirmado" });
        } else if (guard === "debt") {
          await db.insert(taxActiveDebts).values({ originDebtType: "ISS S4", year: 2026, originalValue: 5.12, originalValueDecimal: new Decimal("5.12"), updatedValue: 5.12, updatedValueDecimal: new Decimal("5.12"), taxpayerId: assessment.taxpayerId, assessmentId: assessment.id, status: "INSCRITA", ...f.scope });
        } else {
          await db.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_MOVEMENT", status: "EFETIVADO", title: "Compensação documentada", source: "TEST", data: { operation: "COMPENSAR", amount: "0.01" } });
        }
        await assert.rejects(cancelNfse(connection, actor, { invoiceId: invoice.id, reason: "Origem com movimento" }), inspectionError(/regularização pela origem/));
        assert.equal((await db.select().from(taxInvoices).where(eq(taxInvoices.id, invoice.id)))[0].status, "Emitida");
        assert.equal((await db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id)))[0].finalValueDecimal?.toFixed(2), "5.12");
      }
      await db.update(taxFinancialMappings).set({ defaultBankAccountId: "s4-other-bank" }).where(eq(taxFinancialMappings.taxId, "s4-tax"));
      await assert.rejects(emitNfse(connection, actor, emission), inspectionError(/autorizadas/));
      await db.update(taxFinancialMappings).set({ defaultBankAccountId: "s4-bank" }).where(eq(taxFinancialMappings.taxId, "s4-tax"));
      await db.update(economicRegistrations).set({ status: "Inativo" }).where(eq(economicRegistrations.id, "s4-registration"));
      await assert.rejects(emitNfse(connection, actor, emission), inspectionError(/não conferem/));
    });
  } finally { await f.close(); }
});
