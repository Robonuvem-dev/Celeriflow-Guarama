import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { JsonNull } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as mappings from "../src/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { accountingEntries, accountingTransactions } from "../src/db/schema/finance-accounting";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { revenues, taxRevenueIntegrations } from "../src/db/schema/finance-revenues";
import { financialYears } from "../src/db/schema/finance-years";
import { readTaxAccountingTransaction, readTaxAssessment, readTaxRegistryEntry, taxAccountingObject as object } from "../src/db/repositories/tax-accounting/records";
import { readTaxAccountingMovements } from "../src/lib/tributacao/accounting-movements";
import { configureTaxAccountingProfile, configureTaxDebtAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { recognizeTaxAssessmentInTransaction, recognizedTaxProfile, reclassifyActiveDebtInTransaction, returnActiveDebtReceivableInTransaction, postTaxAssessmentAdjustment } from "../src/lib/tributacao/accrual-accounting";
import { executeTaxRefund, recordTaxExcessInTransaction } from "../src/lib/tributacao/credit-finance";
import { reverseTaxCreditMovement } from "../src/lib/tributacao/credit-reversal";
import { reverseTaxPayment } from "../src/lib/tributacao/payment-reversal";
import { applyConditionalGuideDiscount, assertPaymentOptionDebtEligibility, reverseConditionalPaymentDiscount } from "../src/lib/tributacao/conditional-discounts";
import { postAccountingTransactionInTransaction } from "../src/lib/financeiro";
import { createDrizzleTaxAccountingFixture, taxAccountingDate as date, taxAccountingScope as scope } from "./helpers/drizzle-tax-accounting-fixture";
import { postgresError } from "./helpers/postgres-assertion";

test("Tax accounting: physical columns/numerics/temporal/FKs match the independent installed catalog", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as {
    catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[]; constraints: { schema: string; table_name: string; name: string; type: string; definition: string }[] };
  };
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const installed = catalog.columns.filter(column => column.schema === "public" && column.table_name === config.name);
    assert.equal(config.columns.length, installed.length, config.name);
    for (const column of config.columns) {
      const physical = installed.find(item => item.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name} nullability`);
      assert.equal(column.getSQLType().replace(/\s/g, "").replace("withouttimezone", ""), physical.type.replace(/\s/g, "").replace("withouttimezone", ""), `${config.name}.${column.name} type`);
    }
    const fks = catalog.constraints.filter(item => item.schema === "public" && item.table_name === config.name && item.type === "f");
    assert.equal(config.foreignKeys.length, fks.length, `${config.name} FK coverage`);
    for (const fk of config.foreignKeys) {
      const physical = fks.find(item => item.name === fk.getName());
      assert.ok(physical, fk.getName());
      const reference = fk.reference();
      const normalize = (value: string) => value.replaceAll('"', "").replace(/\s/g, "").toLowerCase();
      assert.ok(normalize(physical.definition).includes(normalize(`FOREIGN KEY (${reference.columns.map(column => column.name).join(",")}) REFERENCES ${getTableConfig(reference.foreignTable).name}(${reference.foreignColumns.map(column => column.name).join(",")})`)), fk.getName());
      assert.ok(physical.definition.includes(`ON UPDATE ${(fk.onUpdate ?? "no action").toUpperCase()}`), fk.getName());
      assert.ok(physical.definition.includes(`ON DELETE ${(fk.onDelete ?? "no action").toUpperCase()}`), fk.getName());
    }
  }
});

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Tax accounting: original transaction, immutable origins and DTOs (${jurisdiction})`, async t => {
    const f = await createDrizzleTaxAccountingFixture(jurisdiction);
    const tx = <T>(operation: Parameters<typeof withDatabaseTransaction<T>>[1]) => withDatabaseTransaction(f.connection, operation, { timeoutMs: 60000 });
    const registry = async (category: string, entityId?: string) => f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, category), entityId ? eq(taxRegistryEntries.entityId, entityId) : undefined));
    const postingCount = async (sourceId: string) => (await f.db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceId, sourceId)))[0].total;
    try {
      await t.test("profile replay validates content, scoped authorization and additive supersession", async () => {
        const first = await configureTaxAccountingProfile(f.connection, f.actor, f.profileInput);
        const replay = await Promise.all([configureTaxAccountingProfile(f.connection, f.actor, f.profileInput), configureTaxAccountingProfile(f.connection, f.actor, f.profileInput)]);
        assert.ok(replay.every(row => row.id === first.id));
        assert.ok(first.effectiveFrom instanceof Date);
        assert.equal(first.effectiveUntil?.toISOString(), "2026-12-31T23:59:59.999Z");
        assert.equal(object(first.data).supersedesEntryId, null);
        await assert.rejects(configureTaxAccountingProfile(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, f.profileInput), /autorizadas/);
        await assert.rejects(configureTaxAccountingProfile(f.connection, f.actor, { ...f.profileInput, reason: "Conteúdo alterado" }), /outros dados/);
        await assert.rejects(configureTaxAccountingProfile(f.connection, f.actor, { ...f.profileInput, idempotencyKey: "overlap" }), /sobreposto/);
        const replacement = await configureTaxAccountingProfile(f.connection, f.actor, { ...f.profileInput, idempotencyKey: "ta-profile-v2", effectiveFrom: new Date("2026-10-01"), supersedesEntryId: first.id });
        assert.equal(replacement.version, 2);
        assert.deepEqual(await readTaxRegistryEntry(f.db, first.id), first);
        assert.equal((await f.db.select().from(taxAuditLogs).where(eq(taxAuditLogs.action, "CONFIGURE_ACCOUNTING_PROFILE"))).length, 2);
      });

      await t.test("recognition/adjustment keep exact numeric(18,2), replay and atomic rollback", async () => {
        await f.assessment("ta-recognition", "9007199254740991.99");
        await assert.rejects(tx(async executor => { await recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-recognition"); throw new Error("injected recognition rollback"); }), /injected recognition rollback/);
        assert.equal(await postingCount("ta-recognition"), 0);
        assert.equal((await registry("ACCOUNTING_POSITION", "ta-recognition")).length, 0);
        await tx(executor => recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-recognition"));
        await tx(executor => recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-recognition"));
        assert.equal(await postingCount("ta-recognition"), 1);
        const position = (await registry("ACCOUNTING_POSITION", "ta-recognition"))[0];
        assert.equal(object(position.data).originalValue, "9007199254740991.99");
        const original = await readTaxAccountingTransaction(f.db, String(object(position.data).recognitionTransactionId));
        assert.equal(original.date.toISOString(), date.toISOString());
        assert.ok(original.entries.every(line => line.valueDecimal?.toFixed(2) === "9007199254740991.99"));
        const adjustment = { assessmentId: "ta-recognition", date, delta: new Decimal("-0.01"), kind: "BENEFIT" as const, idempotencyKey: "ta-adjustment", reason: "Ajuste centesimal documentado" };
        await tx(executor => postTaxAssessmentAdjustment(executor, f.actor, adjustment));
        assert.equal((await tx(executor => postTaxAssessmentAdjustment(executor, f.actor, adjustment)))?.id, (await f.db.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, adjustment.idempotencyKey)))[0].id);
        await assert.rejects(tx(executor => postTaxAssessmentAdjustment(executor, f.actor, { ...adjustment, delta: new Decimal("0.01") })), /não pode aumentar/);
        await assert.rejects(tx(executor => recognizeTaxAssessmentInTransaction(executor, { ...f.actor, allowedBudgetUnitIds: [] }, "ta-recognition")), /autorizadas/);
        await f.assessment("ta-legacy");
        await f.db.update(taxAssessments).set({ calculationSnapshot: { ...scope, recognitionPolicy: "PRESERVE_LEGACY_NO_RETROACTIVE_RECOGNITION" } }).where(eq(taxAssessments.id, "ta-legacy"));
        await tx(executor => recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-legacy"));
        assert.equal(await postingCount("ta-legacy"), 0);
      });

      await t.test("active debt reclassification and return preserve original receivable, edition and entity", async () => {
        await f.assessment("ta-debt-assessment");
        await tx(executor => recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-debt-assessment"));
        const profileInput = { taxId: "ta-iptu", budgetUnitId: scope.budgetUnitId, catalogVersionId: "ta-catalog", originalReceivableAccountId: "ta-right", debtReceivableAccountId: "ta-debt-right", lossAccountId: "ta-debt-loss", effectiveFrom: f.profileInput.effectiveFrom, effectiveUntil: f.profileInput.effectiveUntil, reason: "Reclassificação municipal de DA", idempotencyKey: "ta-debt-profile" };
        const profile = await configureTaxDebtAccountingProfile(f.connection, f.actor, profileInput);
        assert.equal((await configureTaxDebtAccountingProfile(f.connection, f.actor, profileInput)).id, profile.id);
        await f.db.insert(mappings.taxActiveDebts).values({ id: "ta-debt", originDebtType: "Tributária", year: 2026, originalValue: 100, originalValueDecimal: new Decimal(100), updatedValue: 100, updatedValueDecimal: new Decimal(100), taxpayerId: "ta-payer", assessmentId: "ta-debt-assessment", ...scope });
        const position = await tx(executor => reclassifyActiveDebtInTransaction(executor, f.actor, "ta-debt", date));
        assert.ok(position);
        assert.equal((await tx(executor => reclassifyActiveDebtInTransaction(executor, f.actor, "ta-debt", date)))?.id, position.id);
        assert.equal((await tx(executor => recognizedTaxProfile(executor, f.actor, "ta-debt-assessment", date)))?.receivableAccountId, "ta-debt-right");
        await tx(executor => returnActiveDebtReceivableInTransaction(executor, f.actor, "ta-debt", date, "Devolução documentada"));
        assert.equal((await readTaxRegistryEntry(f.db, position.id)).status, "DEVOLVIDA");
        assert.equal((await tx(executor => recognizedTaxProfile(executor, f.actor, "ta-debt-assessment", date)))?.receivableAccountId, "ta-right");
      });

      await t.test("conditional discount is not cash; debt restrictions, reversal, JSON null and frozen evidence", async () => {
        await f.assessment("ta-discount");
        await tx(executor => recognizeTaxAssessmentInTransaction(executor, f.actor, "ta-discount"));
        await f.guide("ta-discount-guide", "ta-discount", "90.00");
        const option = { code: "UNICA", name: "Cota única", dueDate: "2026-12-31", discountPercent: "10", debtCheck: "NONE" as const, debtTaxIds: [], legalBasis: "Decisão municipal" };
        await f.db.update(taxGuides).set({ calculationSnapshot: { conditionalPaymentOption: option, grossAmount: "100.00", nested: { amount: "0001.00", date: "not-a-date" } } }).where(eq(taxGuides.id, "ta-discount-guide"));
        const beforeCash = (await f.db.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total;
        await tx(executor => applyConditionalGuideDiscount(executor, f.actor, { guideId: "ta-discount-guide", amountPaid: new Decimal(90), paymentDate: date, paymentKey: "ta-discount-payment" }));
        assert.equal((await readTaxAssessment(f.db, "ta-discount")).finalValueDecimal?.toFixed(2), "90.00");
        const issuance = (await registry("CONDITIONAL_DISCOUNT", "ta-discount"))[0];
        const reverse = () => tx(executor => reverseConditionalPaymentDiscount(executor, f.actor, { assessmentId: "ta-discount", paymentKey: "ta-discount-payment", date, reason: "Estorno de cota única" }));
        await reverse(); await reverse();
        assert.deepEqual(await readTaxRegistryEntry(f.db, issuance.id), issuance);
        const restored = await readTaxAssessment(f.db, "ta-discount");
        assert.equal(restored.finalValueDecimal?.toFixed(2), "100.00");
        assert.equal(object(restored.calculationSnapshot).conditionalDiscountPaymentKey, null);
        assert.equal((await registry("CONDITIONAL_DISCOUNT_REVERSAL", "ta-discount")).length, 1);
        assert.equal((await f.db.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total, beforeCash);
        await assert.rejects(tx(executor => assertPaymentOptionDebtEligibility(executor, { taxpayerId: "ta-payer", assessmentId: "ta-discount", year: 2026, governmentEntityId: scope.governmentEntityId, option: { ...option, debtCheck: "CURRENT" } })), /débito do exercício/);
        await f.db.update(taxGuides).set({ calculationSnapshot: JsonNull }).where(eq(taxGuides.id, "ta-discount-guide"));
        assert.equal((await f.db.select().from(taxGuides).where(eq(taxGuides.id, "ta-discount-guide")))[0].calculationSnapshot, null);
        const nulls = await f.db.execute<{ literal: boolean; sqlnull: boolean }>(sql`SELECT "calculationSnapshot" = 'null'::jsonb AS literal, "calculationSnapshot" IS NULL AS sqlnull FROM "TaxGuide" WHERE id = 'ta-discount-guide'`);
        assert.deepEqual(nulls.rows[0], { literal: true, sqlnull: false });
      });

      await t.test("excess, paid refund and reversal use one transaction for treasury/accounting/audit", async () => {
        await f.assessment("ta-cash-assessment");
        await f.guide("ta-cash-guide", "ta-cash-assessment");
        const payment = await f.payment("ta-cash-payment", "ta-cash-guide");
        await f.db.insert(revenues).values({ id: "ta-cash-revenue", date, collectionDate: date, value: 100, valueDecimal: new Decimal(100), financialYearId: "ta-year", budgetUnitId: scope.budgetUnitId, revenueNatureId: "ta-nature", resourceSourceId: "ta-source", bankAccountId: "ta-bank", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: payment.id });
        await f.db.insert(taxRevenueIntegrations).values({ taxPaymentId: payment.id, revenueId: "ta-cash-revenue", idempotencyKey: "ta-cash-integration" });
        await f.db.insert(taxRegistryEntries).values({ id: "ta-excess", entityType: "TAXPAYER", entityId: "ta-payer", category: "TAX_CREDIT", title: "Excedente restituível", status: "DISPONIVEL", source: "RETORNO_BANCARIO", data: { ...scope, originEventKey: payment.idempotencyKey, originGuideId: payment.guideId, amount: "40.00", available: "0.00" } });
        await assert.rejects(tx(async executor => { await recordTaxExcessInTransaction(executor, f.actor, { creditId: "ta-excess", bankAccountId: "ta-bank", date, amount: new Decimal(40) }); throw new Error("injected excess rollback"); }), /injected excess rollback/);
        assert.equal(await postingCount("ta-excess"), 0);
        const ingress = await tx(executor => recordTaxExcessInTransaction(executor, f.actor, { creditId: "ta-excess", bankAccountId: "ta-bank", date, amount: new Decimal(40) }));
        await f.db.insert(taxRegistryEntries).values({ id: "ta-refund", entityType: "TAXPAYER", entityId: "ta-payer", category: "REFUND_REQUEST", title: "Restituição aprovada", status: "APROVADA_AGUARDANDO_TESOURARIA", data: { ...scope, sourceCreditId: "ta-excess", amount: "40.00" } });
        const input = { requestId: "ta-refund", date, bankAccountId: "ta-bank", proofDocumentId: "ta-proof", idempotencyKey: "ta-refund-payment" };
        await assert.rejects(executeTaxRefund(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
        await f.database.exec(`CREATE FUNCTION ta_fail_refund_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PAY_REFUND' THEN RAISE EXCEPTION 'injected refund audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER ta_fail_refund_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION ta_fail_refund_audit();`);
        await assert.rejects(executeTaxRefund(f.connection, f.actor, input), postgresError("P0001", "injected refund audit rollback"));
        assert.equal((await readTaxRegistryEntry(f.db, "ta-refund")).status, "APROVADA_AGUARDANDO_TESOURARIA");
        assert.equal(await postingCount("ta-refund"), 0);
        assert.equal((await f.db.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.sourceId, "ta-refund"))).length, 0);
        assert.equal((await f.db.select().from(mappings.taxIntegrationEvents).where(eq(mappings.taxIntegrationEvents.idempotencyKey, "TAX_REFUND:ta-refund-payment"))).length, 0);
        await f.database.exec('DROP TRIGGER ta_fail_refund_audit ON "TaxAuditLog"; DROP FUNCTION ta_fail_refund_audit();');
        const event = await executeTaxRefund(f.connection, f.actor, input);
        assert.equal((await executeTaxRefund(f.connection, f.actor, input)).id, event.id);
        await assert.rejects(executeTaxRefund(f.connection, f.actor, { ...input, proofDocumentId: "other" }), /outros dados/);
        const reversal = { movementId: "ta-refund", date, reason: "Retorno documentado dos recursos", proofDocumentId: "ta-proof", idempotencyKey: "ta-refund-reversal" };
        const [reversed, concurrent] = await Promise.all([reverseTaxCreditMovement(f.connection, f.actor, reversal), reverseTaxCreditMovement(f.connection, f.actor, reversal)]);
        assert.equal(concurrent.id, reversed.id);
        assert.equal((await reverseTaxCreditMovement(f.connection, f.actor, reversal)).id, reversed.id);
        await assert.rejects(reverseTaxCreditMovement(f.connection, f.actor, { ...reversal, reason: "Outro fundamento" }), /outros dados/);
        assert.deepEqual((await f.db.select().from(mappings.taxIntegrationEvents).where(eq(mappings.taxIntegrationEvents.id, event.id)))[0], event);
        assert.equal(object((await readTaxRegistryEntry(f.db, "ta-excess")).data).available, "40.00");
        assert.equal((await readTaxAccountingTransaction(f.db, ingress.transactionId)).reversedBy, null);
      });

      await t.test("canonical payment reversal restores financial origin atomically and replays content", async () => {
        // Seed the original receipt with real financial postings, then exercise
        // the migrated reversal (no Tax owner's legacy confirmation fixture).
        await f.assessment("ta-reversal-assessment", "25.00");
        await f.guide("ta-reversal-guide", "ta-reversal-assessment", "25.00");
        const payment = await f.payment("ta-reversal-payment", "ta-reversal-guide", "25.00");
        await f.db.insert(revenues).values({ id: "ta-reversal-revenue", date, collectionDate: date, value: 25, valueDecimal: new Decimal(25), financialYearId: "ta-year", budgetUnitId: scope.budgetUnitId, revenueNatureId: "ta-nature", resourceSourceId: "ta-source", bankAccountId: "ta-bank", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: payment.id });
        await f.db.insert(taxRevenueIntegrations).values({ taxPaymentId: payment.id, revenueId: "ta-reversal-revenue", idempotencyKey: "ta-reversal-link" });
        await f.db.insert(reconciliationTreasuryMovements).values({ date, type: "Revenue", direction: "Entrada", valueDecimal: new Decimal(25), bankAccountId: "ta-bank", resourceSourceId: "ta-source", financialYearId: "ta-year", revenueId: "ta-reversal-revenue", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: payment.id });
        await tx(executor => postAccountingTransactionInTransaction(executor, f.actor, { financialYearId: "ta-year", ...scope, date, history: "Recebimento original", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: "ta-reversal-revenue", eventType: "RECEITA_ARRECADADA", idempotencyKey: "ta-reversal-original", lines: [{ accountId: "ta-cash", type: "Débito", value: new Decimal(25) }, { accountId: "ta-vpa", type: "Crédito", value: new Decimal(25) }] }));
        const input = { paymentId: payment.id, date, reason: "Estorno documentado do pagamento", idempotencyKey: "ta-payment-reversal" };
        await assert.rejects(reverseTaxPayment(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizadas/);
        await f.database.exec(`CREATE FUNCTION ta_fail_payment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='REVERSE_PAYMENT' THEN RAISE EXCEPTION 'injected payment audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER ta_fail_payment_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION ta_fail_payment_audit();`);
        await assert.rejects(reverseTaxPayment(f.connection, f.actor, input), postgresError("P0001", "injected payment audit rollback"));
        assert.equal((await f.db.select().from(mappings.taxPayments).where(eq(mappings.taxPayments.id, payment.id)))[0].status, "Confirmado");
        assert.equal((await f.db.select().from(revenues).where(eq(revenues.id, "ta-reversal-revenue")))[0].stage, "ARRECADADA");
        assert.equal((await f.db.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.idempotencyKey, "FINANCEIRO:REVENUE:ta-reversal-revenue:REVERSED"))).length, 0);
        await f.database.exec('DROP TRIGGER ta_fail_payment_audit ON "TaxAuditLog"; DROP FUNCTION ta_fail_payment_audit();');
        const event = await reverseTaxPayment(f.connection, f.actor, input);
        assert.equal((await reverseTaxPayment(f.connection, f.actor, input)).id, event.id);
        await assert.rejects(reverseTaxPayment(f.connection, f.actor, { ...input, reason: "Outra razão" }), /outros dados/);
        assert.equal((await f.db.select().from(mappings.taxPayments).where(eq(mappings.taxPayments.id, payment.id)))[0].status, "Estornado");
        const original = (await f.db.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, "ta-reversal-original")))[0];
        assert.ok((await readTaxAccountingTransaction(f.db, original.id)).reversedBy);
      });

      await t.test("report follows tax identity, reversal origins, scoped lines and pending references", async () => {
        await f.assessment("ta-report-assessment", "9007199254740991.99", "ta-iss");
        await f.guide("ta-report-guide", "ta-report-assessment", "9007199254740991.99");
        await f.seedPosting("ta-report-original", "TAX_ASSESSMENT", "ta-report-assessment", "9007199254740991.99");
        await f.seedPosting("ta-report-reversed", "UNRELATED_REVERSAL_TYPE", "unrelated", "9007199254740991.99", { reversalOfId: "ta-report-original" });
        await f.seedPosting("ta-report-restricted", "TAX_ASSESSMENT", "ta-report-assessment", "1.00", { budgetUnitId: "ta-restricted" });
        const pending = await f.payment("ta-report-payment", "ta-report-guide", "2.00");
        await f.db.insert(mappings.taxIntegrationEvents).values([
          { id: "ta-report-return", integrationCode: "BANK_RETURN", eventType: "PAYMENT", idempotencyKey: pending.idempotencyKey!, status: "PROCESSADO", payload: { amount: "2.00", occurredAt: date.toISOString() } },
          { id: "ta-report-reference", integrationCode: "ACCOUNTING", eventType: "ARRECADACAO", idempotencyKey: "ta-report-reference-key", status: "PENDENTE", payload: { sourceId: "ta-report-return", amount: "2.00", competence: date.toISOString() } },
          { id: "ta-report-invalid", integrationCode: "ACCOUNTING", eventType: "ARRECADACAO", idempotencyKey: "ta-report-invalid-key", status: "PENDENTE", payload: { sourceId: "ta-report-return", amount: "999.00", competence: date.toISOString() } },
        ]);
        const input = { governmentEntityId: scope.governmentEntityId, financialYearId: "ta-year", taxId: "ta-iss", through: "2026-01-31" };
        const report = await readTaxAccountingMovements(f.connection, f.actor, input);
        assert.deepEqual(report.transactions.map(row => row.id).sort(), ["ta-report-original", "ta-report-reversed"]);
        assert.equal(report.total, 2);
        assert.equal(report.availableTotal, 1);
        assert.equal(report.available[0].date, date.toISOString());
        assert.equal(report.available[0].amount, "2.00");
        assert.ok(report.transactions.every(row => row.date === date.toISOString()));
        const filtered = await readTaxAccountingMovements(f.connection, f.actor, { ...input, account: "TA.D", minimum: "9007199254740991.99", maximum: "9007199254740991.99" });
        assert.equal(filtered.total, 2);
        assert.equal(filtered.transactions.length, 2);
        assert.equal(filtered.availableTotal, 0);
        assert.ok(filtered.transactions.every(row => row.entries.length === 1 && row.entries[0].amount === "9007199254740991.99"));
        assert.deepEqual(object(filtered.transactions[0].entries[0].classificationSnapshot).nested, { amount: "001.00", date: "not-a-date" });
        await assert.rejects(readTaxAccountingMovements(f.connection, { allowedBudgetUnitIds: [] }, input), /autorizados/);
        await assert.rejects(readTaxAccountingMovements(f.connection, f.actor, { ...input, governmentEntityId: "ta-other" }), /diverge/);
        const [persistedYear] = await f.db.select().from(financialYears).where(eq(financialYears.id, "ta-year"));
        assert.ok(persistedYear.startDate instanceof Date);
        assert.equal(persistedYear.endDate.toISOString(), "2026-12-31T23:59:59.999Z");
        const lines = await f.db.select().from(accountingEntries).where(inArray(accountingEntries.transactionId, ["ta-report-original", "ta-report-reversed"]));
        assert.ok(lines.every(line => line.valueDecimal instanceof Decimal && line.valueDecimal.toFixed(2) === "9007199254740991.99"));
      });
    } finally { await f.close(); }
  });
}
