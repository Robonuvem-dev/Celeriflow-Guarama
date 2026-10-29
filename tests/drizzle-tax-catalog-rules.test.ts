import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { databaseTimestamp } from "../src/db/temporal";
import * as catalogMappings from "../src/db/schema/tax-catalog-rules";
import * as itbiMappings from "../src/db/schema/tax-itbi";
import * as dteMappings from "../src/db/schema/taxation-dte";

test("pure catalog rules: complete physical mappings match the independent installed catalog", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  for (const table of [...Object.values(catalogMappings), ...Object.values(itbiMappings), ...Object.values(dteMappings)]) {
    const config = getTableConfig(table);
    const columns = catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(columns.length, config.columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(row => row.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name}`);
      const normalize = (value: string) => value.replace(/\s/g, "").replace("withouttimezone", "");
      assert.equal(normalize(column.getSQLType()), normalize(physical.type));
    }
  }
});

test("catalog rules physical: original SQL, real Neon/Drizzle, independent SQL receipts and atomic cross-domain effects", { timeout: 240000 }, async t => {
  // No DMMF, generated DDL, Prisma fixture or production URL. This unchanged
  // helper replays every historical migration on the central local transport.
  const { createDrizzleTaxAccountingFixture } = await import("./helpers/drizzle-tax-accounting-fixture");
  const { configureTaxAccountingProfile } = await import("../src/lib/tributacao/accounting-profile");
  const { withDatabaseTransaction } = await import("../src/db/transaction");
  const s2 = await import("../src/lib/tributacao/s2-service");
  const s3 = await import("../src/lib/tributacao/s3-service");
  const f = await createDrizzleTaxAccountingFixture();
  f.connection.pool.options.max = 1; // PGlite has one backend: queued callers, not multibackend contention proof.
  const rows = async <Row>(query: Promise<{ rows: Row[] }>) => (await query).rows;
  const count = async (table: string) => Number((await rows(f.database.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`)))[0].n);
  const snapshot = async () => {
    const tables = ["TaxAssessment", "TaxIntegrationEvent", "TaxRegistryEntry", "TaxGuide", "TaxAuditLog", "AccountingTransaction", "AccountingEntry", "ItbiEvent", "ItbiParty", "Document"];
    return Object.fromEntries(await Promise.all(tables.map(async table => [table, await count(table)])));
  };
  const blockedActor = { ...f.actor, allowedBudgetUnitIds: [] };
  let assessmentId = "", guideNumber = "", creditId = "";
  try {
    await configureTaxAccountingProfile(f.connection, f.actor, f.profileInput);
    await f.database.exec(`INSERT INTO "TaxParameter" (id,"taxId",code,name,"calculationType",configuration,"effectiveFrom","effectiveUntil","updatedAt") VALUES ('cr-rule','ta-iptu','CR','Regra fiscal','PERCENTUAL_BASE','{"formula":"PERCENTUAL_BASE","rate":"4","installments":3,"calendar":["2026-11-01","2026-12-01","2026-12-31"],"legalBasis":"Lei municipal de ensaio","reference":"CR-2026"}','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
      INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,"updatedAt") VALUES ('cr-origin','TAX_PARAMETER','cr-rule','PARAMETER_SCOPE','Origem fiscal','{"governmentEntityId":"ta-entity","budgetUnitId":"ta-unit"}',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('cr-buyer','PF',CURRENT_TIMESTAMP),('cr-buyer2','PF',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingEventCatalog" (id,code,name,"updatedAt") VALUES ('cr-compensation','TAX_CREDIT_COMPENSATED','Compensação tributária',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId","isReference","updatedAt") VALUES ('cr-compensation-rule','cr-compensation','ta-liability','ta-right',false,CURRENT_TIMESTAMP);`);
    const input = { taxId: "ta-iptu", parameterId: "cr-rule", taxpayerId: "ta-payer", taxableBase: "250.00", competence: new Date("2026-01-31T12:34:56.789Z"), originKey: "cr-origin" };

    await t.test("fiscal rule resolution, zero-effect simulation, frozen legal memory, same-transaction rollback and replay", async () => {
      const before = await snapshot();
      const simulation = await s2.simulateParametrizedAssessment(f.db, { ...input, effectiveAt: input.competence });
      assert.equal(simulation.effect, "SIMULACAO_SEM_EFEITO"); assert.equal(simulation.calculation.principal.toFixed(2), "10.00");
      assert.deepEqual(simulation.calculation.schedule.map(row => row.amount.toFixed(2)), ["3.33", "3.33", "3.34"]);
      assert.equal(simulation.parameter.effectiveUntil?.toISOString(), "2026-12-31T23:59:59.999Z");
      assert.deepEqual(await snapshot(), before);
      await assert.rejects(s2.resolveFiscalRule(f.db, { ...input, effectiveAt: new Date("2027-01-01") }), /vigente/);
      await f.database.exec(`INSERT INTO "TaxParameter" SELECT 'cr-overlap',"taxId",'OVERLAP',name,"calculationType",configuration,"effectiveFrom","effectiveUntil","isActive","createdAt","updatedAt" FROM "TaxParameter" WHERE id='cr-rule';`);
      await assert.rejects(s2.resolveFiscalRule(f.db, { taxId: "ta-iptu", effectiveAt: input.competence }), /sobrepostas/);
      await f.database.exec('UPDATE "TaxParameter" SET "isActive"=false WHERE id=\'cr-overlap\'');
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => { await s2.createParametrizedAssessmentInTransaction(tx, f.actor, input); throw new Error("caller progress rollback"); }), /caller progress rollback/);
      assert.deepEqual(await snapshot(), before, "assessment + accounting + origin + audit roll back with the caller");
      const [created, replay] = await Promise.all([s2.createParametrizedAssessment(f.connection, f.actor, input), s2.createParametrizedAssessment(f.connection, f.actor, input)]);
      assessmentId = created.id; assert.equal(replay.id, created.id);
      const [oracle] = await rows(f.database.query<{ amount: string; rate: string; competence: string; memory: Record<string, unknown> }>('SELECT "originalValueDecimal"::text AS amount,rate::text,"competence"::text,"calculationSnapshot" AS memory FROM "TaxAssessment" WHERE id=$1', [created.id]));
      assert.equal(oracle.amount, "10.00"); assert.equal(oracle.rate, "4.000000");
      assert.equal(databaseTimestamp(String(oracle.competence)).toISOString(), input.competence.toISOString());
      assert.equal(created.competence?.toISOString(), input.competence.toISOString());
      const memory = oracle.memory;
      assert.equal(memory.legalBasis, "Lei municipal de ensaio"); assert.equal(memory.financialYearId, "ta-year"); assert.equal(memory.fixedValue, null);
      await assert.rejects(s2.createParametrizedAssessment(f.connection, blockedActor, input), /autorizadas/);
      await assert.rejects(s2.createParametrizedAssessment(f.connection, f.actor, { ...input, taxableBase: "251" }), /outros dados/);
      await f.database.exec(`UPDATE "TaxParameter" SET configuration=configuration || '{"legalBasis":"Outra lei"}'::jsonb WHERE id='cr-rule';`);
      await assert.rejects(s2.createParametrizedAssessment(f.connection, f.actor, input), /memória/);
      await f.database.exec(`UPDATE "TaxParameter" SET configuration=configuration || '{"legalBasis":"Lei municipal de ensaio"}'::jsonb WHERE id='cr-rule';`);
    });

    await t.test("credit events/revision preserve immutable decisions, Decimal position and audit rollback", async () => {
      const eventInput = { assessmentId, eventType: "EXTINCAO_NAO_FINANCEIRA" as const, amount: "3.00", reason: "Extinção fundamentada", idempotencyKey: "cr-extinction" };
      const event = await s2.registerCreditEvent(f.connection, f.actor, eventInput);
      assert.equal((await s2.registerCreditEvent(f.connection, f.actor, eventInput)).id, event.id);
      assert.equal((await s2.getAssessmentAccount(f.db, assessmentId)).position.balance.toFixed(2), "7.00");
      await assert.rejects(s2.registerCreditEvent(f.connection, f.actor, { ...eventInput, amount: "4" }), /outros dados/);
      await assert.rejects(s2.registerCreditEvent(f.connection, f.actor, { ...eventInput, eventType: "COMPENSACAO", idempotencyKey: "cr-invalid" }), /crédito disponível/);
      const revision = { assessmentId, imposedValue: "9", reason: "Revisão fundamentada", idempotencyKey: "cr-revision" };
      const before = await snapshot();
      await f.database.exec(`CREATE FUNCTION cr_fail_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='REVISE' THEN RAISE EXCEPTION 'revision audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER cr_fail_revision BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION cr_fail_revision();`);
      await assert.rejects(s2.reviseTaxAssessment(f.connection, f.actor, revision), /revision audit rollback/);
      assert.deepEqual(await snapshot(), before); assert.equal((await s2.getAssessmentAccount(f.db, assessmentId)).position.balance.toFixed(2), "7.00");
      await f.database.exec('DROP TRIGGER cr_fail_revision ON "TaxAuditLog"; DROP FUNCTION cr_fail_revision();');
      const revised = await s2.reviseTaxAssessment(f.connection, f.actor, revision);
      assert.equal((await s2.reviseTaxAssessment(f.connection, f.actor, revision)).id, revised.id);
      assert.equal(revised.version, 2); assert.equal((await s2.getAssessmentAccount(f.db, assessmentId)).position.balance.toFixed(2), "9.00");
      await assert.rejects(s2.reviseTaxAssessment(f.connection, blockedActor, revision), /autorizadas/);
    });

    await t.test("partial/grouped guides, PIX and collection return preserve cash boundary, excess ingress, reversal and canonical references", async () => {
      const beforeTransactions = await count("AccountingTransaction");
      const guide = await s2.generatePartialTaxGuide(f.connection, f.actor, { assessmentId, amount: "9", dueDate: new Date("2026-12-31T23:59:59.999Z") });
      guideNumber = guide.guideNumber!;
      const pix = await s2.createPixCharge(f.connection, f.actor, { guideId: guide.id, idempotencyKey: "cr-pix" });
      assert.equal((await s2.createPixCharge(f.connection, f.actor, { guideId: guide.id, idempotencyKey: "cr-pix" })).id, pix.id);
      assert.equal(await count("TaxPayment"), 0); assert.equal(await count("AccountingTransaction"), beforeTransactions);
      await assert.rejects(s2.reviseTaxAssessment(f.connection, f.actor, { assessmentId, imposedValue: "8", reason: "Revisão com guia aberta", idempotencyKey: "cr-open" }), /guias abertas/);
      const returnedInput = { guideNumber, amount: "11", occurredAt: new Date("2026-03-01T12:34:56.789Z"), status: "CONFIRMADO" as const, idempotencyKey: "cr-return" };
      const before = await snapshot();
      await f.database.exec(`CREATE FUNCTION cr_fail_return() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PROCESS_BANK_RETURN' THEN RAISE EXCEPTION 'bank audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER cr_fail_return BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION cr_fail_return();`);
      await assert.rejects(s2.processCollectionReturn(f.connection, f.actor, returnedInput), /bank audit rollback/);
      assert.deepEqual(await snapshot(), before); assert.equal(await count("TaxPayment"), 0); assert.equal(await count("Revenue"), 0); assert.equal(await count("TreasuryMovement"), 0);
      await f.database.exec('DROP TRIGGER cr_fail_return ON "TaxAuditLog"; DROP FUNCTION cr_fail_return();');
      const returned = await s2.processCollectionReturn(f.connection, f.actor, returnedInput);
      assert.equal((await s2.processCollectionReturn(f.connection, f.actor, returnedInput)).id, returned.id);
      const result = returned.result as Record<string, string>; creditId = result.creditEntryId;
      assert.equal(result.applied, "9.00"); assert.equal(result.excess, "2.00");
      assert.equal((await rows(f.database.query<{ amount: string }>('SELECT "amountPaidDecimal"::text AS amount FROM "TaxPayment" WHERE "idempotencyKey"=$1', ['BANK_RETURN:cr-return'])))[0].amount, "9.00");
      const reference = await s2.sendAccountingReference(f.connection, f.actor, { sourceType: "ARRECADACAO", sourceId: returned.id, amount: "11", competence: returnedInput.occurredAt });
      assert.equal(reference.status, "PROCESSADO");
      assert.equal((await s2.sendAccountingReference(f.connection, f.actor, { sourceType: "ARRECADACAO", sourceId: returned.id, amount: "11", competence: returnedInput.occurredAt })).id, reference.id);
      await assert.rejects(s2.processCollectionReturn(f.connection, blockedActor, returnedInput), /autorizadas/);
      await assert.rejects(s2.processCollectionReturn(f.connection, f.actor, { ...returnedInput, amount: "12" }), /outros dados/);
      const a = await f.assessment("cr-group-a", "2"), b = await f.assessment("cr-group-b", "3");
      const grouped = await s2.generateGroupedTaxGuides(f.connection, f.actor, { assessmentIds: [b.id, a.id, b.id], dueDate: new Date("2026-12-31") });
      assert.equal(grouped.total.toFixed(2), "5.00"); assert.deepEqual(grouped.guides.map(row => row.assessmentId), [a.id, b.id]);
      await assert.rejects(s2.generateGroupedTaxGuides(f.connection, f.actor, { assessmentIds: [a.id, b.id], dueDate: new Date("2026-12-31") }), /saldo livre/);
      const rejected = await s2.processCollectionReturn(f.connection, f.actor, { ...returnedInput, idempotencyKey: "cr-rejected", guideNumber: "absent", status: "REJEITADO" });
      assert.equal(rejected.status, "REJEITADO");
    });

    await t.test("transfers/refunds preserve reserved credit, rejection restores once, agreement versions and reconciliation audit are atomic", async () => {
      const transferred = await s2.applyTaxCredit(f.connection, f.actor, { creditId, amount: "1", operation: "TRANSFERIR", destinationTaxpayerId: "cr-buyer", reason: "Transferência fundamentada", idempotencyKey: "cr-transfer" });
      assert.equal(transferred.status, "PROCESSADO");
      const refund = await s2.applyTaxCredit(f.connection, f.actor, { creditId, amount: "1", operation: "RESTITUIR", reason: "Restituição fundamentada", idempotencyKey: "cr-refund" });
      const requestId = (refund.result as Record<string, string>).movementId;
      await s2.approveRefundRequest(f.connection, f.actor, { requestId, approved: false, reason: "Pedido indeferido" });
      await assert.rejects(s2.approveRefundRequest(f.connection, f.actor, { requestId, approved: false, reason: "Pedido indeferido" }), /pendente/);
      const [credit] = await rows(f.database.query<{ data: Record<string, string>; status: string }>('SELECT data,status FROM "TaxRegistryEntry" WHERE id=$1', [creditId]));
      assert.equal(credit.data.available, "1.00"); assert.equal(credit.status, "DISPONIVEL");
      const target = await f.assessment("cr-compensated", "1");
      const compensationInput = { creditId, operation: "COMPENSAR" as const, assessmentId: target.id, amount: "1", reason: "Compensação fundamentada", idempotencyKey: "cr-compensate" };
      const compensation = await s2.applyTaxCredit(f.connection, f.actor, compensationInput);
      assert.equal((await s2.applyTaxCredit(f.connection, f.actor, compensationInput)).id, compensation.id);
      assert.equal((await s2.getAssessmentAccount(f.db, target.id)).position.balance.toFixed(2), "0.00");
      const { reverseTaxCreditMovement } = await import("../src/lib/tributacao/credit-reversal");
      const reverseInput = { movementId: (compensation.result as Record<string, string>).movementId, date: new Date(), reason: "Reversão fundamentada da compensação", idempotencyKey: "cr-compensation-reversal" };
      const reversed = await reverseTaxCreditMovement(f.connection, f.actor, reverseInput);
      assert.equal((await reverseTaxCreditMovement(f.connection, f.actor, reverseInput)).id, reversed.id);
      assert.equal((await s2.getAssessmentAccount(f.db, target.id)).position.balance.toFixed(2), "1.00");
      const agreement = await s2.configureCollectionAgreement(f.connection, f.actor, { code: " cr ", name: "Convênio", bankAccountId: "ta-bank" });
      const next = await s2.configureCollectionAgreement(f.connection, f.actor, { code: "CR", name: "Nova vigência" });
      assert.equal(next.version, 2); assert.equal((await rows(f.database.query<{ status: string }>('SELECT status FROM "TaxRegistryEntry" WHERE id=$1', [agreement.id])))[0].status, "SUBSTITUIDO");
      const reconciliation = await s2.createReconciliation(f.connection, f.actor, { agreementId: "CR", date: new Date("2026-03-01"), paymentTotal: "10.01", remittanceTotal: "10" });
      await assert.rejects(s2.closeReconciliation(f.connection, f.actor, reconciliation.id), /diferença/);
      await s2.resolveReconciliation(f.connection, f.actor, { id: reconciliation.id, adjustment: "0.01", reason: "Diferença saneada" });
      const closed = await s2.closeReconciliation(f.connection, f.actor, reconciliation.id); assert.equal(closed.status, "FECHADA");
      const before = await count("TaxRegistryEntry");
      await f.database.exec(`CREATE FUNCTION cr_fail_agreement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONFIGURE_AGREEMENT' THEN RAISE EXCEPTION 'agreement audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER cr_fail_agreement BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION cr_fail_agreement();`);
      await assert.rejects(s2.configureCollectionAgreement(f.connection, f.actor, { code: "CR", name: "Edição revertida" }), /agreement audit rollback/);
      assert.equal(await count("TaxRegistryEntry"), before); assert.equal((await rows(f.database.query<{ status: string }>('SELECT status FROM "TaxRegistryEntry" WHERE id=$1', [next.id])))[0].status, "ATIVO");
      await f.database.exec('DROP TRIGGER cr_fail_agreement ON "TaxAuditLog"; DROP FUNCTION cr_fail_agreement();');
    });

    await t.test("ITBI parties/six decimals/legal snapshots, debt origin, transmission, approval+DAM+GED rollback and replay", async () => {
      await f.database.exec(`INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('cr-itbi','ITBI','Imposto',CURRENT_TIMESTAMP);
        INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('cr-itbi-map','cr-itbi','ta-nature','ta-source','ta-bank',CURRENT_TIMESTAMP);
        INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('cr-process-type','ITBI',CURRENT_TIMESTAMP);
        INSERT INTO "Subject" (id,name,"processTypeId","updatedAt") VALUES ('cr-subject','Transmissão','cr-process-type',CURRENT_TIMESTAMP);
        INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","updatedAt") VALUES ('cr-process','CR-2026','cr-process-type','cr-subject',CURRENT_TIMESTAMP);
        INSERT INTO "RealEstate" (id,"taxpayerId","landArea","builtArea","updatedAt") VALUES ('cr-property','ta-payer',100,50,CURRENT_TIMESTAMP);
        INSERT INTO "ItbiTransactionType" (id,code,name,rate,"legalBasis","updatedAt") VALUES ('cr-type','CR','Compra e venda',2.123456,'Lei ITBI municipal',CURRENT_TIMESTAMP);
        INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,"updatedAt") VALUES ('cr-property-profile','REAL_ESTATE','cr-property','PROPERTY_PROFILE','Origem imobiliária','{"governmentEntityId":"ta-entity","budgetUnitId":"ta-unit"}',CURRENT_TIMESTAMP),('cr-type-origin','ITBI_TRANSACTION_TYPE','cr-type','PARAMETER_SCOPE','Origem da modalidade','{"governmentEntityId":"ta-entity","budgetUnitId":"ta-unit"}',CURRENT_TIMESTAMP);`);
      await configureTaxAccountingProfile(f.connection, f.actor, { ...f.profileInput, taxId: "cr-itbi", idempotencyKey: "cr-itbi-profile" });
      const input = { transactionTypeId: "cr-type", realEstateId: "cr-property", processId: "cr-process", registryOffice: "Cartório municipal", transmittedFractionPercent: 50, declaredPropertyValue: 1000.01, sellerTaxpayerId: "ta-payer", buyers: [{ taxpayerId: "cr-buyer", sharePercent: 60 }, { taxpayerId: "cr-buyer2", sharePercent: 40 }], cadastralUpdateMode: "AUTO_ON_APPROVAL" as const, dueDate: "2026-12-31" };
      await assert.rejects(s3.createItbiDeclaration(f.connection, f.actor, { ...input, dueDate: "2026-02-30" }), /Vencimento/);
      await assert.rejects(s3.createItbiDeclaration(f.connection, f.actor, { ...input, transmittedFractionPercent: 50.0000001 }), /seis casas/);
      await assert.rejects(s3.createItbiDeclaration(f.connection, blockedActor, input), /autorizadas/);
      const rejected = await s3.createItbiDeclaration(f.connection, f.actor, input);
      await s3.transmitItbiDeclaration(f.connection, f.actor, rejected.id);
      assert.equal((await s3.analyzeItbiDeclaration(f.connection, f.actor, { declarationId: rejected.id, approved: false, notes: "Indeferimento fundamentado" })).status, "INDEFERIDA");
      const declaration = await s3.createItbiDeclaration(f.connection, f.actor, input);
      assert.equal(declaration.parties.length, 3); assert.equal(declaration.appliedRate.toFixed(6), "2.123456"); assert.equal(declaration.cadastralUpdateMode, "AUTO_ON_PAYMENT");
      const [oracle] = await rows(f.database.query<{ base: string; tax: string; memory: Record<string, unknown> }>('SELECT round("declaredPropertyValue"*"transmittedFraction"/100,2)::text AS base,round(round("declaredPropertyValue"*"transmittedFraction"/100,2)*"appliedRate"/100,2)::text AS tax,"calculationSnapshot" AS memory FROM "ItbiDeclaration" WHERE id=$1', [declaration.id]));
      assert.equal(declaration.taxableBase.toFixed(2), oracle.base); assert.equal(declaration.taxAmount.toFixed(2), oracle.tax);
      assert.equal(oracle.memory.valuationMemory, null); assert.equal(oracle.memory.legalBasis, "Lei ITBI municipal");
      await s3.transmitItbiDeclaration(f.connection, f.actor, declaration.id);
      const before = await snapshot(), historyBefore = await rows(f.database.query<{ id: string }>('SELECT id FROM "TaxRegistryEntry" WHERE category=\'ITBI_FIELD_HISTORY\' ORDER BY id'));
      await f.database.exec(`CREATE FUNCTION cr_fail_itbi_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."documentType"='ITBI' THEN RAISE EXCEPTION 'ITBI GED rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER cr_fail_itbi_document BEFORE INSERT ON "Document" FOR EACH ROW EXECUTE FUNCTION cr_fail_itbi_document();`);
      await assert.rejects(s3.confirmItbiWithDocuments(f.connection, f.actor, { declarationId: declaration.id, notes: "Aprovado" }), /ITBI GED rollback/);
      assert.deepEqual(await snapshot(), before); assert.deepEqual(await rows(f.database.query<{ id: string }>('SELECT id FROM "TaxRegistryEntry" WHERE category=\'ITBI_FIELD_HISTORY\' ORDER BY id')), historyBefore);
      assert.equal((await rows(f.database.query<{ status: string; assessmentId: string | null }>('SELECT status,"assessmentId" FROM "ItbiDeclaration" WHERE id=$1', [declaration.id])))[0].status, "PROTOCOLADA");
      await f.database.exec('DROP TRIGGER cr_fail_itbi_document ON "Document"; DROP FUNCTION cr_fail_itbi_document();');
      const confirmed = await s3.confirmItbiWithDocuments(f.connection, f.actor, { declarationId: declaration.id, notes: "Aprovado" });
      assert.deepEqual(await s3.confirmItbiWithDocuments(f.connection, f.actor, { declarationId: declaration.id, notes: "Replay" }), confirmed);
      assert.equal((await s3.issueItbiDam(f.connection, f.actor, declaration.id)).id, confirmed.guideId);
      assert.equal((await s3.generateItbiDocument(f.connection, f.actor, declaration.id)).id, confirmed.documentId);
      assert.equal((await rows(f.database.query<{ taxpayerId: string | null }>('SELECT "taxpayerId" FROM "RealEstate" WHERE id=\'cr-property\'')))[0].taxpayerId, "ta-payer", "approval and document emission do not transfer ownership");
    });

    await t.test("DTE confirmation/access hashes, event rollback, notices vs reading/ack, UTC deadline/retention and power history", async () => {
      await s3.ensureTributarioS3Defaults(f.connection);
      const created = await s3.createDteMailbox(f.connection, { taxpayerId: "ta-payer", emailNoticeEnabled: true, smsNoticeEnabled: true });
      assert.ok(created.confirmationToken); assert.notEqual(created.mailbox.confirmationTokenHash, created.confirmationToken);
      assert.equal(created.mailbox.confirmationTokenHash, createHash("sha256").update(created.confirmationToken).digest("hex"));
      const active = await s3.confirmDteMailbox(f.connection, created.confirmationToken);
      assert.equal(active.status, "ATIVA"); assert.equal(active.confirmationTokenHash, null); assert.ok(active.confirmedAt instanceof Date);
      const again = await s3.createDteMailbox(f.connection, { taxpayerId: "ta-payer", emailNoticeEnabled: true, smsNoticeEnabled: true }); assert.equal(again.confirmationToken, null); assert.equal(again.mailbox.id, active.id);
      const { grant, accessCode } = await s3.createDteAccessGrant(f.connection, f.actor, { mailboxId: active.id, authorizedTaxpayerId: "cr-buyer", validUntil: new Date("2027-01-01") });
      assert.equal(grant.codeLast4, accessCode.slice(-4)); assert.notEqual(grant.codeHash, accessCode);
      assert.equal((await s3.validateDteAccessGrant(f.db, { accessCode, authorizedTaxpayerId: "cr-buyer" })).id, active.id);
      await assert.rejects(s3.validateDteAccessGrant(f.db, { accessCode, authorizedTaxpayerId: "cr-buyer2" }), /inválido/);
      await s3.revokeDteAccessGrant(f.connection, grant.id);
      await assert.rejects(s3.validateDteAccessGrant(f.db, { accessCode, authorizedTaxpayerId: "cr-buyer" }), /revogado/);
      const [{ id: categoryId }] = await rows(f.database.query<{ id: string }>('SELECT id FROM "DteCategory" WHERE code=\'AVISO\''));
      const sendInput = { mailboxIds: [active.id, active.id], categoryId: String(categoryId), subject: "Aviso", body: "Comunicação fiscal", idempotencyBase: "cr-dte" };
      await f.database.exec(`CREATE FUNCTION cr_fail_dte() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DTE event rollback'; END $$; CREATE TRIGGER cr_fail_dte BEFORE INSERT ON "DteMessageEvent" FOR EACH ROW EXECUTE FUNCTION cr_fail_dte();`);
      await assert.rejects(s3.sendDteMessages(f.connection, f.actor, sendInput), /DTE event rollback/); assert.equal(await count("DteMessage"), 0);
      await f.database.exec('DROP TRIGGER cr_fail_dte ON "DteMessageEvent"; DROP FUNCTION cr_fail_dte();');
      const [message] = await s3.sendDteMessages(f.connection, f.actor, sendInput);
      assert.equal((await s3.sendDteMessages(f.connection, f.actor, sendInput))[0].id, message.id);
      assert.equal(message.readAt, null); assert.equal(message.acknowledgedAt, null); assert.equal(message.tacitAcknowledgedAt, null); assert.ok(message.emailNoticeAt); assert.ok(message.smsNoticeAt);
      assert.equal(message.deadlineAt!.getTime() - message.availableAt.getTime(), 5 * 86400000);
      const reading = await s3.registerDteReading(f.connection, f.actor, message.id); assert.equal(reading.status, "LIDA");
      assert.equal((await s3.registerDteReading(f.connection, f.actor, message.id)).readAt?.toISOString(), reading.readAt?.toISOString());
      const acknowledged = await s3.acknowledgeDteMessage(f.connection, f.actor, message.id); assert.equal(acknowledged.status, "CIENCIA_EXPRESSA");
      await assert.rejects(s3.deleteDteMessage(f.connection, f.actor, message.id), /preservação/);
      const [tacit] = await s3.sendDteMessages(f.connection, f.actor, { ...sendInput, idempotencyBase: "cr-tacit" });
      await assert.rejects(s3.applyDteTacitAcknowledgement(f.connection, f.actor, tacit.id, tacit.availableAt), /não expirou/);
      assert.equal((await s3.applyDteTacitAcknowledgement(f.connection, f.actor, tacit.id, tacit.deadlineAt!)).tacitAcknowledgedAt?.toISOString(), tacit.deadlineAt?.toISOString());
      const [disposable] = await s3.sendDteMessages(f.connection, f.actor, { ...sendInput, idempotencyBase: "cr-disposable" });
      assert.equal((await s3.deleteDteMessage(f.connection, f.actor, disposable.id)).status, "EXCLUIDA"); assert.equal(await count("DteMessage"), 3);
      const power = await s3.createDtePowerOfAttorney(f.connection, f.actor, { actorTaxpayerId: "ta-payer", grantorTaxpayerId: "ta-payer", attorneyTaxpayerId: "cr-buyer", establishmentCnpjs: ["12.345.678/0001-90"], legitimacyMode: "AUTHENTICATED_INTERNAL" });
      assert.equal(power.status, "PENDENTE_ACEITE"); assert.equal((await s3.transitionDtePowerOfAttorney(f.connection, f.actor, power.id, "ACEITAR")).status, "ATIVA");
      assert.equal((await s3.transitionDtePowerOfAttorney(f.connection, f.actor, power.id, "REVOGAR")).status, "REVOGADA");
      await assert.rejects(s3.transitionDtePowerOfAttorney(f.connection, f.actor, power.id, "ACEITAR"), /transição/);
      assert.equal((await rows(f.database.query<{ n: number }>('SELECT count(*)::int AS n FROM "DtePowerOfAttorneyEvent" WHERE "powerOfAttorneyId"=$1', [power.id])))[0].n, 3);
    });
  } finally { await f.close(); }
});
