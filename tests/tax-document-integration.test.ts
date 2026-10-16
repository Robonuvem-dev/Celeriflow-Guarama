import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
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
      await assert.rejects(emitNfse(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      const invoice = await emitNfse(f.db, f.actor, input);
      const assessment = await f.db.taxAssessment.findFirstOrThrow({ where: { calculationSnapshot: { path: ["invoiceId"], equals: invoice.id } } });
      assert.equal(assessment.finalValueDecimal!.toFixed(2), "4.00");
      assert.equal(await f.db.nfseDmsDeclaration.count({ where: { payload: { path: ["invoiceId"], equals: invoice.id } } }), 2);
      const auto = await f.db.nfseDmsDeclaration.findFirstOrThrow({ where: { channel: "NFSE_AUTOMATICA" } });
      await assert.rejects(createDmsDeclaration(f.db, f.actor, { taxpayerId: auto.taxpayerId, economicRegistrationId: auto.economicRegistrationId ?? undefined, competence: auto.competence, direction: auto.direction, channel: "WEB", detailMode: "DOCUMENTO", noMovement: false, rectifiesDeclarationId: auto.id, serviceValue: 100, deductions: 20, ownIss: 4, retainedIss: 0 }), /origem/);
      const replacement = { invoiceId: invoice.id, reason: "Substituição fundamentada do documento fiscal", serviceDescription: "Serviço corrigido", serviceValue: 120, deductions: 20, retained: false };
      const before = await f.db.accountingTransaction.count();
      await f.pg.exec(`CREATE FUNCTION fail_nfse_substitution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='SUBSTITUIDA' THEN RAISE EXCEPTION 'nfse substitution rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_nfse_substitution BEFORE INSERT ON "NfseEvent" FOR EACH ROW EXECUTE FUNCTION fail_nfse_substitution();`);
      await assert.rejects(substituteNfse(f.db, f.actor, replacement), /nfse substitution rollback/);
      assert.equal(await f.db.invoice.count(), 1);
      assert.equal(await f.db.accountingTransaction.count(), before);
      assert.equal((await f.db.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } })).finalValueDecimal!.toFixed(2), "4.00");
      assert.equal((await f.db.nfseDeductionCredit.findUniqueOrThrow({ where: { id: credit.id } })).availableAmountDecimal.toFixed(2), "0.00");
      await f.pg.exec('DROP TRIGGER fail_nfse_substitution ON "NfseEvent"; DROP FUNCTION fail_nfse_substitution();');
      const [created, replay] = await Promise.all([substituteNfse(f.db, f.actor, replacement), substituteNfse(f.db, f.actor, replacement)]);
      assert.equal(created.id, replay.id);
      assert.equal((await f.db.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } })).status, "Cancelado");
      assert.equal((await f.db.nfseDeductionCredit.findUniqueOrThrow({ where: { id: credit.id } })).availableAmountDecimal.toFixed(2), "10.00");
      assert.equal(await f.db.nfseDmsDeclaration.count({ where: { payload: { path: ["invoiceId"], equals: invoice.id }, status: "SUBSTITUIDA" } }), 2);
      const cancellation = { invoiceId: created.id, reason: "Cancelamento fundamentado da nota substituta" };
      await Promise.all([cancelNfse(f.db, f.actor, cancellation), cancelNfse(f.db, f.actor, cancellation)]);
      assert.equal(await f.db.nfseEvent.count({ where: { invoiceId: created.id, eventType: "CANCELADA" } }), 1);
      assert.equal(await f.db.taxAssessment.count({ where: { status: { not: "Cancelado" } } }), 0);
      const balance = (await f.db.accountingEntry.findMany({ where: { accountId: "document-right" } })).reduce((sum, entry) => sum.plus(entry.type === "Débito" ? entry.valueDecimal! : entry.valueDecimal!.negated()), new Prisma.Decimal(0));
      assert.equal(balance.toFixed(2), "0.00");
      const occasional = await createOccasionalRequest(f.db, f.actor, { providerTaxpayerId: "seller", takerTaxpayerId: "buyer-one", serviceActivityId: "document-activity", serviceDescription: "Nota avulsa documentada", serviceValue: 100, deductions: 0, paymentRequired: true });
      const approved = await approveOccasionalRequest(f.db, f.actor, occasional.id);
      assert.equal((await approveOccasionalRequest(f.db, f.actor, occasional.id)).assessmentId, approved.assessmentId);
      await assert.rejects(releaseOccasionalRequest(f.db, f.actor, occasional.id, "document-registration"), /pagamento Decimal integral/);
      await confirmTaxPayment(f.db, f.actor, { guideId: approved.guideId!, amountPaid: "5", paymentDate: new Date(), paymentMethod: "Manual", idempotencyKey: "occasional-paid" });
      const released = await Promise.all([releaseOccasionalRequest(f.db, f.actor, occasional.id, "document-registration"), releaseOccasionalRequest(f.db, f.actor, occasional.id, "document-registration")]);
      assert.equal(released[0].id, released[1].id);
      assert.equal(await f.db.taxAssessment.count({ where: { status: { not: "Cancelado" } } }), 1);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });

  test(`P2 ${jurisdiction}: quitação ITBI transfere frações e estorno recompõe titularidade sem apagar história`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T12:00:00Z") });
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createTaxDocumentFixture(jurisdiction);
    try {
      await f.db.realEstate.create({ data: { id: "property", taxpayerId: "seller" } });
      const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, competence: new Date(), taxId: "ITBI", taxpayerId: "seller", taxableBase: "100", rate: "1" });
      await f.db.itbiTransactionType.create({ data: { id: "sale", code: "VENDA", name: "Venda", rate: "1" } });
      const declaration = await f.db.itbiDeclaration.create({ data: { declarationNumber: "ITBI-01", transactionTypeId: "sale", realEstateId: "property", assessmentId: assessment.id, status: "APROVADA", cadastralUpdateMode: "AUTO_ON_PAYMENT", transmittedFraction: "60", declaredPropertyValue: "100", taxableBase: "100", appliedRate: "1", taxAmount: "1", calculationSnapshot: f.scope, createdByUsuarioId: "ana", parties: { create: [{ taxpayerId: "seller", role: "TRANSMITENTE", participationPercent: "100" }, { taxpayerId: "buyer-one", role: "ADQUIRENTE", participationPercent: "50" }, { taxpayerId: "buyer-two", role: "ADQUIRENTE", participationPercent: "50" }] } } });
      const guide = await generateTaxGuide(f.db, f.actor, { assessmentId: assessment.id, dueDate: new Date("2026-12-31") });
      const payment = { guideId: guide.id, amountPaid: "0.50", paymentDate: new Date(), paymentMethod: "Manual", idempotencyKey: "itbi-first-half" };
      await confirmTaxPayment(f.db, f.actor, payment);
      assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: "property" } })).taxpayerId, "seller");
      await f.pg.exec(`CREATE FUNCTION fail_itbi_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='FISCAL_OWNERSHIP' THEN RAISE EXCEPTION 'itbi transfer rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_itbi_transfer BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION fail_itbi_transfer();`);
      const finalPayment = { ...payment, idempotencyKey: "itbi-second-half" };
      await assert.rejects(confirmTaxPayment(f.db, f.actor, finalPayment), /itbi transfer rollback/);
      assert.equal(await f.db.taxPayment.count(), 1);
      assert.equal(await f.db.revenue.count(), 1);
      await f.pg.exec('DROP TRIGGER fail_itbi_transfer ON "TaxRegistryEntry"; DROP FUNCTION fail_itbi_transfer();');
      await Promise.all([confirmTaxPayment(f.db, f.actor, finalPayment), confirmTaxPayment(f.db, f.actor, finalPayment)]);
      const position = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { category: "FISCAL_OWNERSHIP", status: "ATIVO" } });
      const owners = (position.data as Prisma.JsonObject).owners as Array<{ taxpayerId: string; sharePercent: string }>;
      assert.deepEqual(Object.fromEntries(owners.map(owner => [owner.taxpayerId, owner.sharePercent])), { "buyer-one": "30", "buyer-two": "30", seller: "40" });
      assert.ok((await f.db.itbiDeclaration.findUniqueOrThrow({ where: { id: declaration.id } })).cadastralUpdatedAt);
      const first = await f.db.taxPayment.findUniqueOrThrow({ where: { idempotencyKey: payment.idempotencyKey } });
      await reverseTaxPayment(f.db, f.actor, { paymentId: first.id, date: new Date(), reason: "Estorno fundamentado da primeira parcela do ITBI", idempotencyKey: "itbi-reverse" });
      assert.equal((await f.db.itbiDeclaration.findUniqueOrThrow({ where: { id: declaration.id } })).cadastralUpdatedAt, null);
      assert.deepEqual((await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: position.id } })).data, position.data);
      assert.equal((await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: position.id } })).status, "ESTORNADO");
      assert.equal(await f.db.taxRegistryEntry.count({ where: { category: "FISCAL_OWNERSHIP", status: "ATIVO" } }), 1);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });

  test(`P2 ${jurisdiction}: perfil DA versionado congela contas da reclassificação`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01T12:00:00Z") });
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createTaxDocumentFixture(jurisdiction);
    try {
      const input = { taxId: "ISS", budgetUnitId: "ug", catalogVersionId: "document-catalog", originalReceivableAccountId: "document-right", debtReceivableAccountId: "document-debt-right", lossAccountId: "document-debt-loss", effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Classificação municipal conferida na base isolada", idempotencyKey: "debt-profile" };
      const [profile, replay] = await Promise.all([configureTaxDebtAccountingProfile(f.db, f.actor, input), configureTaxDebtAccountingProfile(f.db, f.actor, input)]);
      assert.equal(profile.id, replay.id);
      await assert.rejects(configureTaxDebtAccountingProfile(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
      await assert.rejects(configureTaxDebtAccountingProfile(f.db, f.actor, { ...input, idempotencyKey: "overlap" }), /Sobreposição/);
      const assessment = await createTaxAssessment(f.db, f.actor, { year: 2026, competence: new Date(), taxId: "ISS", taxpayerId: "seller", taxableBase: "100", rate: "1" });
      const debt = await enrollAssessmentInActiveDebt(f.db, f.actor, assessment.id);
      const position = await f.db.$transaction(tx => reclassifyActiveDebtInTransaction(tx, f.actor, debt.id, new Date()));
      assert.equal((position!.data as Prisma.JsonObject).profileEntryId, profile.id);
      assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "ACTIVE_DEBT_RECLASSIFICATION" } }), 1);
      await configureTaxDebtAccountingProfile(f.db, f.actor, { ...input, effectiveFrom: new Date("2026-09-01"), idempotencyKey: "replacement", supersedesEntryId: profile.id });
      assert.deepEqual((await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: position!.id } })).data, position!.data);
    } finally { await f.close(); if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  });
}
