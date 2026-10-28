import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingEntries } from "../src/db/schema/finance-accounting";
import { taxAssessments } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import { realEstates } from "../src/db/schema/registry";
import { itbiDeclarations, itbiParties, itbiTransactionTypes } from "../src/db/schema/tax-itbi";
import { countTaxRows, firstTaxRow, readTaxChainRecord, readTaxChainRegistry, taxChainObject, taxChainDatabaseFailure } from "./helpers/tax-chain-database";
import { createTaxDocumentFixture } from "./helpers/tax-document-fixture";
import { emitNfse, substituteNfse, cancelNfse, createDeductionCredit, createDmsDeclaration, approveOccasionalRequest, createOccasionalRequest, releaseOccasionalRequest } from "../src/lib/tributacao/s4-service";
import { createTaxAssessment, generateTaxGuide, confirmTaxPayment, enrollAssessmentInActiveDebt } from "../src/lib/tributacao";
import { reverseTaxPayment } from "../src/lib/tributacao/payment-reversal";
import { configureTaxDebtAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { reclassifyActiveDebtInTransaction } from "../src/lib/tributacao/accrual-accounting";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P2 ${jurisdiction}: NFS-e, débito e escritas prestado/tomado têm rollback e reversão únicos`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T12:00:00Z") });
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createTaxDocumentFixture(jurisdiction);
    try {
      const credit = await createDeductionCredit(f.db, f.actor, { taxpayerId: "seller", economicRegistrationId: "document-registration", creditType: "MATERIAIS", originDocument: "GED-01", amount: 10 });
      const input = { providerId: "seller", takerId: "buyer-one", economicRegistrationId: "document-registration", serviceActivityId: "document-activity", competence: "09/2026", serviceDescription: "Serviço municipal documentado", serviceValue: "100.00", manualDeductions: "10.00", retained: false, creditUsages: [{ creditId: credit.id, amount: "10.00" }] };
      await assert.rejects(emitNfse(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      const invoice = await emitNfse(f.connection, f.actor, input);
      const assessment = firstTaxRow(await f.db.select().from(taxAssessments).where(sql`${taxAssessments.calculationSnapshot}->>'invoiceId'=${invoice.id}`));
      assert.equal(assessment.finalValueDecimal!.toFixed(2), "4.00");
      assert.equal(await countTaxRows(f.db, "NfseDmsDeclaration", sql`payload->>'invoiceId'=${invoice.id}`), 2);
      const auto = await readTaxChainRecord<{ id: string; taxpayerId: string; economicRegistrationId: string | null; competence: string; direction: string }>(f.db, sql`SELECT id,"taxpayerId","economicRegistrationId",competence,direction FROM "NfseDmsDeclaration" WHERE channel='NFSE_AUTOMATICA' LIMIT 1`);
      await assert.rejects(createDmsDeclaration(f.connection, f.actor, { taxpayerId: auto.taxpayerId, economicRegistrationId: auto.economicRegistrationId ?? undefined, competence: auto.competence, direction: auto.direction, channel: "WEB", detailMode: "DOCUMENTO", noMovement: false, rectifiesDeclarationId: auto.id, serviceValue: 100, deductions: 20, ownIss: 4, retainedIss: 0 }), /origem/);
      const replacement = { invoiceId: invoice.id, reason: "Substituição fundamentada do documento fiscal", serviceDescription: "Serviço corrigido", serviceValue: 120, deductions: 20, retained: false };
      const before = await countTaxRows(f.db, "AccountingTransaction");
      await f.database.exec(`CREATE FUNCTION fail_nfse_substitution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='SUBSTITUIDA' THEN RAISE EXCEPTION 'nfse substitution rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_nfse_substitution BEFORE INSERT ON "NfseEvent" FOR EACH ROW EXECUTE FUNCTION fail_nfse_substitution();`);
      await assert.rejects(substituteNfse(f.connection, f.actor, replacement), taxChainDatabaseFailure(/nfse substitution rollback/));
      assert.equal(await countTaxRows(f.db, "Invoice"), 1);
      assert.equal(await countTaxRows(f.db, "AccountingTransaction"), before);
      assert.equal(firstTaxRow(await f.db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id))).finalValueDecimal!.toFixed(2), "4.00");
      assert.equal(new Decimal((await readTaxChainRecord<{ available: string }>(f.db, sql`SELECT "availableAmountDecimal"::text AS available FROM "NfseDeductionCredit" WHERE id=${credit.id}`)).available).toFixed(2), "0.00");
      await f.database.exec('DROP TRIGGER fail_nfse_substitution ON "NfseEvent"; DROP FUNCTION fail_nfse_substitution();');
      const [created, replay] = await Promise.all([substituteNfse(f.connection, f.actor, replacement), substituteNfse(f.connection, f.actor, replacement)]);
      assert.equal(created.id, replay.id);
      assert.equal(firstTaxRow(await f.db.select().from(taxAssessments).where(eq(taxAssessments.id, assessment.id))).status, "Cancelado");
      assert.equal(new Decimal((await readTaxChainRecord<{ available: string }>(f.db, sql`SELECT "availableAmountDecimal"::text AS available FROM "NfseDeductionCredit" WHERE id=${credit.id}`)).available).toFixed(2), "10.00");
      assert.equal(await countTaxRows(f.db, "NfseDmsDeclaration", sql`payload->>'invoiceId'=${invoice.id} AND status='SUBSTITUIDA'`), 2);
      const cancellation = { invoiceId: created.id, reason: "Cancelamento fundamentado da nota substituta" };
      await Promise.all([cancelNfse(f.connection, f.actor, cancellation), cancelNfse(f.connection, f.actor, cancellation)]);
      assert.equal(await countTaxRows(f.db, "NfseEvent", sql`"invoiceId"=${created.id} AND "eventType"='CANCELADA'`), 1);
      assert.equal(await countTaxRows(f.db, "TaxAssessment", sql`status<>'Cancelado'`), 0);
      const balance = (await f.db.select().from(accountingEntries).where(eq(accountingEntries.accountId, "document-right"))).reduce((sum, entry) => sum.plus(entry.type === "Débito" ? entry.valueDecimal! : entry.valueDecimal!.negated()), new Decimal(0));
      assert.equal(balance.toFixed(2), "0.00");
      const occasional = await createOccasionalRequest(f.connection, f.actor, { providerTaxpayerId: "seller", takerTaxpayerId: "buyer-one", serviceActivityId: "document-activity", serviceDescription: "Nota avulsa documentada", serviceValue: 100, deductions: 0, paymentRequired: true });
      const approved = await approveOccasionalRequest(f.connection, f.actor, occasional.id);
      assert.equal((await approveOccasionalRequest(f.connection, f.actor, occasional.id)).assessmentId, approved.assessmentId);
      await assert.rejects(releaseOccasionalRequest(f.connection, f.actor, occasional.id, "document-registration"), /pagamento Decimal integral/);
      await confirmTaxPayment(f.connection, f.actor, { guideId: approved.guideId!, amountPaid: "5", paymentDate: new Date(), paymentMethod: "Manual", idempotencyKey: "occasional-paid" });
      const released = await Promise.all([releaseOccasionalRequest(f.connection, f.actor, occasional.id, "document-registration"), releaseOccasionalRequest(f.connection, f.actor, occasional.id, "document-registration")]);
      assert.equal(released[0].id, released[1].id);
      assert.equal(await countTaxRows(f.db, "TaxAssessment", sql`status<>'Cancelado'`), 1);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });

  test(`P2 ${jurisdiction}: quitação ITBI transfere frações e estorno recompõe titularidade sem apagar história`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T12:00:00Z") });
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createTaxDocumentFixture(jurisdiction);
    try {
      await f.db.insert(realEstates).values({ id: "property", taxpayerId: "seller" });
      const assessment = await createTaxAssessment(f.connection, f.actor, { year: 2026, competence: new Date(), taxId: "ITBI", taxpayerId: "seller", taxableBase: "100", rate: "1" });
      await f.db.insert(itbiTransactionTypes).values({ id: "sale", code: "VENDA", name: "Venda", rate: new Decimal("1") });
      const declaration = await withDatabaseTransaction(f.connection, async tx => {
        const row = firstTaxRow(await tx.insert(itbiDeclarations).values({ declarationNumber: "ITBI-01", transactionTypeId: "sale", realEstateId: "property", assessmentId: assessment.id, status: "APROVADA", cadastralUpdateMode: "AUTO_ON_PAYMENT", transmittedFraction: new Decimal("60"), declaredPropertyValue: new Decimal("100"), taxableBase: new Decimal("100"), appliedRate: new Decimal("1"), taxAmount: new Decimal("1"), calculationSnapshot: f.scope, createdByUsuarioId: "ana" }).returning());
        await tx.insert(itbiParties).values([{ declarationId: row.id, taxpayerId: "seller", role: "TRANSMITENTE", participationPercent: new Decimal("100") }, { declarationId: row.id, taxpayerId: "buyer-one", role: "ADQUIRENTE", participationPercent: new Decimal("50") }, { declarationId: row.id, taxpayerId: "buyer-two", role: "ADQUIRENTE", participationPercent: new Decimal("50") }]);
        return row;
      });
      const guide = await generateTaxGuide(f.connection, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-12-31") });
      const payment = { guideId: guide.id, amountPaid: "0.50", paymentDate: new Date(), paymentMethod: "Manual", idempotencyKey: "itbi-first-half" };
      await confirmTaxPayment(f.connection, f.actor, payment);
      assert.equal(firstTaxRow(await f.db.select().from(realEstates).where(eq(realEstates.id, "property"))).taxpayerId, "seller");
      await f.database.exec(`CREATE FUNCTION fail_itbi_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='FISCAL_OWNERSHIP' THEN RAISE EXCEPTION 'itbi transfer rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_itbi_transfer BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_itbi_transfer();`);
      const finalPayment = { ...payment, idempotencyKey: "itbi-second-half" };
      await assert.rejects(confirmTaxPayment(f.connection, f.actor, finalPayment), taxChainDatabaseFailure(/itbi transfer rollback/));
      assert.equal(await countTaxRows(f.db, "TaxPayment"), 1);
      assert.equal(await countTaxRows(f.db, "Revenue"), 1);
      await f.database.exec('DROP TRIGGER fail_itbi_transfer ON "TaxRegistryEntry"; DROP FUNCTION fail_itbi_transfer();');
      await Promise.all([confirmTaxPayment(f.connection, f.actor, finalPayment), confirmTaxPayment(f.connection, f.actor, finalPayment)]);
      const position = await readTaxChainRegistry(f.db, sql`category='FISCAL_OWNERSHIP' AND status='ATIVO'`);
      const owners = taxChainObject(position.data).owners;
      if (!Array.isArray(owners)) throw new Error("Posição fiscal sem lista de titulares.");
      assert.deepEqual(Object.fromEntries(owners.map(owner => { const value = taxChainObject(owner); return [value.taxpayerId, value.sharePercent]; })), { "buyer-one": "30", "buyer-two": "30", seller: "40" });
      assert.ok(firstTaxRow(await f.db.select().from(itbiDeclarations).where(eq(itbiDeclarations.id, declaration.id))).cadastralUpdatedAt);
      const first = firstTaxRow(await f.db.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, payment.idempotencyKey)));
      await reverseTaxPayment(f.connection, f.actor, { paymentId: first.id, date: new Date(), reason: "Estorno fundamentado da primeira parcela do ITBI", idempotencyKey: "itbi-reverse" });
      assert.equal(firstTaxRow(await f.db.select().from(itbiDeclarations).where(eq(itbiDeclarations.id, declaration.id))).cadastralUpdatedAt, null);
      assert.deepEqual((await readTaxChainRegistry(f.db, sql`id=${position.id}`)).data, position.data);
      assert.equal((await readTaxChainRegistry(f.db, sql`id=${position.id}`)).status, "ESTORNADO");
      assert.equal(await countTaxRows(f.db, "TaxRegistryEntry", sql`category='FISCAL_OWNERSHIP' AND status='ATIVO'`), 1);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });

  test(`P2 ${jurisdiction}: perfil DA versionado congela contas da reclassificação`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T12:00:00Z") });
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createTaxDocumentFixture(jurisdiction);
    try {
      const input = { taxId: "ISS", budgetUnitId: "ug", catalogVersionId: "document-catalog", originalReceivableAccountId: "document-right", debtReceivableAccountId: "document-debt-right", lossAccountId: "document-debt-loss", effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Classificação municipal conferida na base isolada", idempotencyKey: "debt-profile" };
      const [profile, replay] = await Promise.all([configureTaxDebtAccountingProfile(f.connection, f.actor, input), configureTaxDebtAccountingProfile(f.connection, f.actor, input)]);
      assert.equal(profile.id, replay.id);
      await assert.rejects(configureTaxDebtAccountingProfile(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      await assert.rejects(configureTaxDebtAccountingProfile(f.connection, f.actor, { ...input, idempotencyKey: "overlap" }), /Sobreposição/);
      const assessment = await createTaxAssessment(f.connection, f.actor, { year: 2026, competence: new Date(), taxId: "ISS", taxpayerId: "seller", taxableBase: "100", rate: "1" });
      const debt = await enrollAssessmentInActiveDebt(f.connection, f.actor, assessment.id);
      const position = await withDatabaseTransaction(f.connection, tx => reclassifyActiveDebtInTransaction(tx, f.actor, debt.id, new Date()));
      assert.equal(taxChainObject(position!.data).profileEntryId, profile.id);
      assert.equal(await countTaxRows(f.db, "AccountingTransaction", sql`"sourceType"='ACTIVE_DEBT_RECLASSIFICATION'`), 1);
      await configureTaxDebtAccountingProfile(f.connection, f.actor, { ...input, effectiveFrom: new Date("2026-09-01"), idempotencyKey: "replacement", supersedesEntryId: profile.id });
      assert.deepEqual((await readTaxChainRegistry(f.db, sql`id=${position!.id}`)).data, position!.data);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });
}
