import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { databaseTimestamp } from "../src/db/temporal";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as mappings from "../src/db/schema/tax-annual";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { annualObject, insertAnnualParameter, insertAnnualRegistry, readAnnualBatch, readAnnualParameter } from "../src/db/repositories/tax-annual/records";
import { readScheduledAssessment } from "../src/db/repositories/tax-annual/guides";
import { annualComparisonFilters, annualValueChange, readAnnualTaxComparison } from "../src/lib/tributacao/annual-comparison";
import { simulateTaxAnnualBatch, simulateTaxAnnualPropertyBatch, queueTaxAnnualBatch, processTaxAnnualBatch, cancelTaxAnnualBatch } from "../src/lib/tributacao/annual-batches";
import { copyTaxAnnualRule } from "../src/lib/tributacao/annual-rollover";
import { classifyBenefitForAnnualReport, readAnnualTaxSummary } from "../src/lib/tributacao/annual-tax-summary";
import { issueScheduledAssessmentGuides } from "../src/lib/tributacao/scheduled-guides";
import { processTaxAnnualCron } from "../src/lib/tributacao/annual-batch-cron";
import { configureTaxAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { postgresError } from "./helpers/postgres-assertion";

test("pure annual: physical mapping agrees with the independent installed catalog; Decimal and Date contracts", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const installed = catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    if (config.name !== "TaxBenefitGrant") assert.equal(config.columns.length, installed.length, config.name);
    for (const column of config.columns) {
      const physical = installed.find(row => row.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null);
      const normalize = (value: string) => value.replace(/\s/g, "").replace("withouttimezone", "");
      assert.equal(normalize(column.getSQLType()), normalize(physical.type));
    }
  }
  assert.deepEqual(annualValueChange(new Decimal(0), new Decimal(1)), { difference: "1.00", percentage: null });
  assert.deepEqual(annualValueChange(new Decimal("100.01"), new Decimal("100.02")), { difference: "0.01", percentage: "0.009999" });
  assert.equal(annualComparisonFilters.safeParse({ governmentEntityId: "e", firstYear: 2025, secondYear: 2026, minimumDifference: "NaN" }).success, false);
  assert.equal(databaseTimestamp("2026-10-28 12:34:56.789").toISOString(), "2026-10-28T12:34:56.789Z");
});

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`annual physical: batches, frozen scopes, calendars, reporting and authorized cron (${jurisdiction})`, { timeout: 240000 }, async t => {
    // Dynamic import keeps the pure catalog/Decimal test free of PGlite setup.
    // This existing helper replays all historical SQL and uses the real local
    // Neon/Drizzle transport. Its owner and the central bootstrap are untouched.
    const { createDrizzleTaxAccountingFixture } = await import("./helpers/drizzle-tax-accounting-fixture");
    const f = await createDrizzleTaxAccountingFixture(jurisdiction);
    f.connection.pool.options.max = 1;
    // One backend queues callers; these tests do NOT certify real multibackend
    // contention (the executor/parent's Neon probes own that evidence).
    const scope = { governmentEntityId: "ta-entity", budgetUnitId: "ta-unit" };
    const tx = <T>(operation: Parameters<typeof withDatabaseTransaction<T>>[1]) => withDatabaseTransaction(f.connection, operation, { timeoutMs: 60000 });
    const total = async (table: string, where = sql`true`) => (await f.db.execute<{ n: number }>(sql`SELECT count(*)::integer AS n FROM ${sql.identifier(table)} WHERE ${where}`)).rows[0].n;
    const registry = (entityId: string, category: string) => f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category)));
    let batchId = "";
    try {
      await configureTaxAccountingProfile(f.connection, f.actor, f.profileInput);
      await f.database.exec(`INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('annual-second','PF',CURRENT_TIMESTAMP);
        INSERT INTO "RealEstate" (id,"taxpayerId","municipalInsc","updatedAt") VALUES ('annual-property','ta-payer','ANNUAL-1',CURRENT_TIMESTAMP);
        INSERT INTO "EconomicRegistration" (id,"taxpayerId","municipalInsc",status,"updatedAt") VALUES ('annual-economic','annual-second','ANNUAL-E1','Ativo',CURRENT_TIMESTAMP);`);
      const parameter = await tx(async executor => {
        const parameter = await insertAnnualParameter(executor, { taxId: "ta-iptu", code: "ANUAL", name: "Regra anual", calculationType: "PERCENTUAL_BASE", configuration: { formula: "PERCENTUAL_BASE", rate: "4", installments: 2, calendar: ["2026-11-10", "2026-12-10"] }, effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z") });
        await insertAnnualRegistry(executor, { entityType: "TAX_PARAMETER", entityId: parameter.id, category: "PARAMETER_SCOPE", title: parameter.name, actorUsuarioId: f.actor.usuarioId, data: scope });
        return parameter;
      });
      const input = { taxId: "ta-iptu", parameterId: parameter.id, competence: "2026-03-01", targetType: "TAXPAYER" as const, targets: [{ targetId: "ta-payer", taxableBase: "100" }, { targetId: "annual-second", taxableBase: "200" }], reason: "Bases anuais conferidas", idempotencyKey: "annual-batch" };
      const queue = { batchId: "", scheduledAt: new Date("2026-01-01"), reason: "Efetivação anual autorizada" };

      await t.test("simulation is effect-free; failed progress rolls back assessment, accounting, event and item together; retry/resume are idempotent", async () => {
        const [batch, repeated] = await Promise.all([simulateTaxAnnualBatch(f.connection, f.actor, input), simulateTaxAnnualBatch(f.connection, f.actor, { ...input, targets: [...input.targets].reverse() })]);
        batchId = batch.id; queue.batchId = batch.id;
        assert.equal(batch.id, repeated.id); assert.equal(batch.budgetUnitId, scope.budgetUnitId);
        assert.equal(batch.competence.toISOString(), "2026-03-01T12:00:00.000Z");
        assert.equal(await total("TaxAssessment"), 0); assert.equal(await total("TaxGuide"), 0);
        assert.equal(await total("AccountingTransaction"), 0);
        await assert.rejects(simulateTaxAnnualBatch(f.connection, f.actor, { ...input, targets: [{ ...input.targets[0], taxableBase: "300" }] }), /outros dados/);
        await assert.rejects(processTaxAnnualBatch(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, batch.id), /autorizados/);
        await queueTaxAnnualBatch(f.connection, f.actor, queue); await queueTaxAnnualBatch(f.connection, f.actor, queue);
        assert.equal(await total("TaxAuditLog", sql`"entityId"=${batch.id} AND action='ANNUAL_QUEUED'`), 1);
        await f.database.exec(`CREATE FUNCTION annual_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='COMPLETED' THEN RAISE EXCEPTION 'annual progress rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER annual_fail_progress BEFORE UPDATE ON "TaxAnnualBatchItem" FOR EACH ROW EXECUTE FUNCTION annual_fail_progress();`);
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, batch.id)).failures.length, 2);
        assert.equal(await total("TaxAssessment"), 0); assert.equal(await total("AccountingTransaction"), 0); assert.equal(await total("AccountingEntry"), 0);
        assert.equal(await total("TaxIntegrationEvent", sql`"integrationCode"='FISCAL_ENGINE'`), 0);
        assert.equal(await total("TaxRegistryEntry", sql`category='ACCOUNTING_POSITION'`), 0);
        await f.database.exec('DROP TRIGGER annual_fail_progress ON "TaxAnnualBatchItem"; DROP FUNCTION annual_fail_progress();');
        await queueTaxAnnualBatch(f.connection, f.actor, queue);
        const processed = await Promise.all([processTaxAnnualBatch(f.connection, f.actor, batch.id, 1), processTaxAnnualBatch(f.connection, f.actor, batch.id, 1)]);
        assert.equal(processed.reduce((sum, result) => sum + result.processed, 0), 2);
        assert.equal((await readAnnualBatch(f.db, batch.id)).status, "COMPLETED");
        assert.equal(await total("TaxAssessment"), 2); assert.equal(await total("AccountingTransaction"), 2); assert.equal(await total("AccountingEntry"), 4);
        assert.equal(await total("TaxAnnualBatchItem", sql`"batchId"=${batch.id} AND attempts=2 AND status='COMPLETED'`), 2);
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, batch.id)).processed, 0);
        await assert.rejects(f.database.query('UPDATE "TaxAnnualBatchItem" SET "simulatedAmount"=99 WHERE "batchId"=$1', [batch.id]), /imutável/);
        await assert.rejects(cancelTaxAnnualBatch(f.connection, f.actor, { batchId: batch.id, reason: "Cancelamento fundamentado" }), /efetivados/);
        const replay = await simulateTaxAnnualBatch(f.connection, f.actor, { ...input, idempotencyKey: "annual-replay" });
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: replay.id });
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, replay.id)).processed, 2);
        assert.equal(await total("TaxAssessment"), 2); assert.equal(await total("AccountingTransaction"), 2);
      });

      await t.test("canonical property Decimal/Date snapshots detect drift; economic targets, future schedule and cancellation preserve history", async () => {
        const propertyInput = { taxId: input.taxId, parameterId: parameter.id, year: 2026, realEstateIds: ["annual-property"], reason: "Avaliações anuais documentadas", idempotencyKey: "annual-property" };
        await assert.rejects(simulateTaxAnnualPropertyBatch(f.connection, f.actor, propertyInput), /sem avaliação/);
        await f.database.exec(`INSERT INTO "PropertyValuation" (id,"realEstateId",year,"venalValueDecimal","landUnitValue",source,"updatedAt") VALUES ('annual-value','annual-property',2026,1000.01,123.123456,'Avaliação documentada','2026-01-31 12:34:56.789');`);
        const batch = await simulateTaxAnnualPropertyBatch(f.connection, f.actor, propertyInput);
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: batch.id });
        const [item] = await f.db.select().from(mappings.annualBatchItems).where(eq(mappings.annualBatchItems.batchId, batch.id));
        const memory = annualObject(annualObject(item.snapshot).baseSource);
        assert.equal(memory.landUnitValue, "123.123456"); assert.equal(memory.constructionUnitValue, null); assert.equal(memory.updatedAt, "2026-01-31T12:34:56.789Z");
        await f.database.exec('UPDATE "PropertyValuation" SET "venalValueDecimal"=1100.01 WHERE id=\'annual-value\'');
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, batch.id)).failures.length, 1);
        const corrected = await simulateTaxAnnualPropertyBatch(f.connection, f.actor, { ...propertyInput, idempotencyKey: "annual-property-corrected" });
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: corrected.id });
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, corrected.id)).processed, 1);
        const [assessment] = await f.db.select().from(taxAssessments).where(eq(taxAssessments.realEstateId, "annual-property"));
        assert.equal(assessment.taxableBaseDecimal?.toFixed(2), "1100.01");
        const economic = await simulateTaxAnnualBatch(f.connection, f.actor, { ...input, idempotencyKey: "annual-economic", targetType: "ECONOMIC_REGISTRATION", targets: [{ targetId: "annual-economic", taxableBase: "100" }] });
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: economic.id, scheduledAt: new Date("2200-01-01") });
        assert.equal((await processTaxAnnualBatch(f.connection, f.actor, economic.id)).processed, 0);
        const cancelled = await cancelTaxAnnualBatch(f.connection, f.actor, { batchId: economic.id, reason: "Cancelamento do calendário futuro" });
        assert.equal((await cancelTaxAnnualBatch(f.connection, f.actor, { batchId: economic.id, reason: "Cancelamento do calendário futuro" })).id, cancelled.id);
        await assert.rejects(cancelTaxAnnualBatch(f.connection, f.actor, { batchId: economic.id, reason: "Outro fundamento de cancelamento" }), /outro fundamento/);
        await assert.rejects(f.database.query('DELETE FROM "TaxAnnualBatch" WHERE id=$1', [economic.id]), /histórico/);
      });

      await t.test("annual rule copy is additive/idempotent; leap-day options require explicit correction and preserve minimum installment cents", async () => {
        await f.database.exec(`INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('annual-2027',2027,'ta-entity','Preparação','2027-01-01','2027-12-31',CURRENT_TIMESTAMP),('annual-2029',2029,'ta-entity','Preparação','2029-01-01','2029-12-31',CURRENT_TIMESTAMP);`);
        const copy = { taxId: input.taxId, parameterId: parameter.id, sourceYear: 2026, targetYear: 2027, calendar: ["2027-11-10", "2027-12-10"], legalBasis: "Fundamento municipal da nova vigência", reference: "Referência documental anual", reason: "Inicialização fundamentada do próximo exercício", idempotencyKey: "annual-copy" };
        const before = await readAnnualParameter(f.db, parameter.id);
        const [first, repeated] = await Promise.all([copyTaxAnnualRule(f.connection, f.actor, copy), copyTaxAnnualRule(f.connection, f.actor, copy)]);
        assert.equal(first.id, repeated.id); assert.equal(first.effectiveFrom.toISOString(), "2027-01-01T00:00:00.000Z");
        assert.deepEqual(await readAnnualParameter(f.db, parameter.id), before);
        await assert.rejects(copyTaxAnnualRule(f.connection, f.actor, { ...copy, calendar: ["2027-11-11", "2027-12-11"] }), /outra configuração/);
        await assert.rejects(copyTaxAnnualRule(f.connection, f.actor, { ...copy, idempotencyKey: "annual-overlap" }), /regra ativa/);
        const leap = await tx(async executor => {
          const rule = await insertAnnualParameter(executor, { taxId: input.taxId, code: "LEAP", name: "Calendário bissexto", calculationType: "VALOR_FIXO", configuration: { formula: "VALOR_FIXO", fixedValue: "100.01", installments: 4, minimumInstallmentValue: "30", calendar: ["2028-03-10", "2028-04-10", "2028-05-10", "2028-06-10"], paymentOptions: [{ code: "UNICA", name: "Cota única", dueDate: "2028-02-29", discountPercent: "5", debtCheck: "NONE", debtTaxIds: [], legalBasis: "Lei municipal" }] }, effectiveFrom: new Date("2028-01-01"), effectiveUntil: new Date("2028-12-31T23:59:59.999Z") });
          await insertAnnualRegistry(executor, { entityType: "TAX_PARAMETER", entityId: rule.id, category: "PARAMETER_SCOPE", title: rule.name, actorUsuarioId: f.actor.usuarioId, data: scope });
          return rule;
        });
        const leapInput = { ...copy, parameterId: leap.id, sourceYear: 2028, targetYear: 2029, calendar: ["2029-03-10", "2029-04-10", "2029-05-10", "2029-06-10"], idempotencyKey: "annual-leap" };
        await assert.rejects(copyTaxAnnualRule(f.connection, f.actor, leapInput), /29 de fevereiro/);
        const copied = await copyTaxAnnualRule(f.connection, f.actor, { ...leapInput, paymentOptionDates: { UNICA: "2029-02-28" } });
        const { evaluateFiscalRule, parseFiscalRuleConfiguration } = await import("../src/lib/tributacao/fiscal-engine");
        const calculated = evaluateFiscalRule({ taxableBase: "1", configuration: parseFiscalRuleConfiguration(copied.configuration) });
        assert.deepEqual(calculated.schedule.map(row => row.amount.toFixed(2)), ["33.33", "33.33", "33.35"]);
        assert.equal(annualObject(copied.configuration).version, 2);
      });

      await t.test("guide sequence, Decimal cents, optimistic Date, conditional option and audit roll back atomically without payment/accounting effects", async () => {
        const assessment = await f.assessment("annual-calendar", "100.01");
        await f.database.query('UPDATE "TaxAssessment" SET "calculationSnapshot"=$1::jsonb WHERE id=$2', [JSON.stringify({ ...scope, schedule: [{ number: 1, amount: "33.34", dueDate: "2026-11-10" }, { number: 2, amount: "33.34", dueDate: "2026-12-10" }, { number: 3, amount: "33.33", dueDate: "2026-12-31" }] }), assessment.id]);
        const current = await readScheduledAssessment(f.db, assessment.id);
        const input = { assessmentId: current.id, expectedUpdatedAt: current.updatedAt.toISOString(), mode: "INSTALLMENT" as const, singleDueDate: null, reason: "Calendário anual conferido" };
        const before = await total("AccountingTransaction"), beforePayments = await total("TaxPayment");
        const sequencesBefore = await f.database.query('SELECT year,"documentType","currentValue" FROM "TaxDocumentSequence" ORDER BY year,"documentType"');
        await f.database.exec(`CREATE FUNCTION annual_fail_guide_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ISSUE_SCHEDULED_TAX_GUIDES' THEN RAISE EXCEPTION 'annual guide audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER annual_fail_guide_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION annual_fail_guide_audit();`);
        await assert.rejects(issueScheduledAssessmentGuides(f.connection, f.actor, input), postgresError("P0001", "annual guide audit rollback"));
        assert.equal(await total("TaxGuide", sql`"assessmentId"=${current.id}`), 0);
        assert.equal((await readScheduledAssessment(f.db, current.id)).status, "Lançado");
        assert.deepEqual((await f.database.query('SELECT year,"documentType","currentValue" FROM "TaxDocumentSequence" ORDER BY year,"documentType"')).rows, sequencesBefore.rows, "row sequence increments share the guide/audit rollback");
        await f.database.exec('DROP TRIGGER annual_fail_guide_audit ON "TaxAuditLog"; DROP FUNCTION annual_fail_guide_audit();');
        const issued = await issueScheduledAssessmentGuides(f.connection, f.actor, input);
        assert.equal(issued.guideIds.length, 3);
        const guides = await f.db.select().from(taxGuides).where(eq(taxGuides.assessmentId, current.id)).orderBy(taxGuides.guideNumber);
        assert.deepEqual(guides.map(row => row.totalValueDecimal?.toFixed(2)), ["33.34", "33.34", "33.33"]);
        assert.equal(guides[0].dueDate.toISOString(), "2026-11-10T23:59:59.999Z");
        assert.match(guides[0].guideNumber!, /^DAM-2026-\d{7}$/);
        const raw = await f.db.execute<{ dueDate: string }>(sql`SELECT "dueDate"::text AS "dueDate" FROM "TaxGuide" WHERE id=${guides[0].id}`);
        assert.equal(databaseTimestamp(raw.rows[0].dueDate).toISOString(), guides[0].dueDate.toISOString());
        await assert.rejects(issueScheduledAssessmentGuides(f.connection, f.actor, input), /alterado|vigentes/);
        const single = await f.assessment("annual-single", "100");
        const option = { code: "UNICA", name: "Cota única", dueDate: "2026-12-31", discountPercent: "10", debtCheck: "NONE", debtTaxIds: [], legalBasis: "Lei municipal conferida" };
        await f.database.query('UPDATE "TaxAssessment" SET "calculationSnapshot"=$1::jsonb WHERE id=$2', [JSON.stringify({ ...scope, paymentOptions: [option] }), single.id]);
        const singleInput = { ...input, assessmentId: single.id, expectedUpdatedAt: single.updatedAt.toISOString(), mode: "SINGLE" as const, paymentOptionCode: "UNICA" };
        const emitted = await issueScheduledAssessmentGuides(f.connection, f.actor, singleInput);
        const [guide] = await f.db.select().from(taxGuides).where(eq(taxGuides.id, emitted.guideIds[0]));
        assert.equal(guide.totalValueDecimal?.toFixed(2), "90.00"); assert.equal(guide.totalValue, 90);
        assert.equal(annualObject(guide.calculationSnapshot).grossAmount, "100.00");
        assert.equal((await readScheduledAssessment(f.db, single.id)).finalValueDecimal?.toFixed(2), "100.00");
        assert.equal(await total("AccountingTransaction"), before); assert.equal(await total("TaxPayment"), beforePayments);
      });

      await t.test("comparison/summary retain compensations, reversed payments, cancelled guides/credits, benefit history and pending Decimal isolation", async () => {
        await f.assessment("annual-report-2025", "100", "ta-iss"); await f.assessment("annual-report-2026", "150", "ta-iss");
        await f.assessment("annual-report-cancelled-assessment", "10", "ta-iss");
        await f.assessment("annual-report-restricted", "999", "ta-iss"); await f.assessment("annual-report-other-entity", "999", "ta-iss");
        await f.database.exec('UPDATE "TaxAssessment" SET year=2025 WHERE id=\'annual-report-2025\'');
        await f.database.exec(`UPDATE "TaxAssessment" SET status='Cancelado' WHERE id='annual-report-cancelled-assessment';
          UPDATE "TaxAssessment" SET "calculationSnapshot"='{"governmentEntityId":"ta-entity","budgetUnitId":"ta-restricted"}' WHERE id='annual-report-restricted';
          UPDATE "TaxAssessment" SET "calculationSnapshot"='{"governmentEntityId":"ta-other","budgetUnitId":"ta-other-unit"}' WHERE id='annual-report-other-entity';`);
        await f.guide("annual-report-guide", "annual-report-2026", "150");
        await f.guide("annual-report-cancelled", "annual-report-2026", "10");
        await f.database.exec(`UPDATE "TaxGuide" SET "dueDate"='2026-01-01',"calculationSnapshot"='null'::jsonb WHERE id='annual-report-guide'; UPDATE "TaxGuide" SET status='Cancelada' WHERE id='annual-report-cancelled';`);
        await f.payment("annual-report-paid", "annual-report-guide", "40"); await f.payment("annual-report-reversed", "annual-report-guide", "20");
        await f.database.exec(`UPDATE "TaxPayment" SET status='Estornado' WHERE id='annual-report-reversed';
          INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,status,data,"updatedAt") VALUES ('annual-compensation','TAX_ASSESSMENT','annual-report-2026','CREDIT_MOVEMENT','Compensação','EFETIVADO','{"operation":"COMPENSAR","amount":"10"}',CURRENT_TIMESTAMP);
          INSERT INTO "TaxBenefitRule" (id,code,name,"benefitType","legalReference",eligibility,calculation,"effectiveFrom","createdByUsuarioId","updatedAt") VALUES ('annual-benefit','ANNUAL','Benefício anual','ISENCAO','Lei municipal','{"governmentEntityId":"ta-entity","budgetUnitId":"ta-unit"}','{}','2026-01-01','ta-user',CURRENT_TIMESTAMP);
          INSERT INTO "TaxBenefitGrant" (id,"ruleId","taxpayerId","sourceType","sourceId","originalAmountDecimal","finalAmountDecimal","calculationSnapshot","grantedByUsuarioId") VALUES ('annual-grant','annual-benefit','ta-payer','TAX_ASSESSMENT','annual-report-2026',150,140,'{}','ta-user');
          INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,source,data,"updatedAt") VALUES ('annual-benefit-event','TAX_ASSESSMENT','annual-report-2026','CREDIT_EVENT','Benefício','BENEFICIO','{"grantId":"annual-grant"}',CURRENT_TIMESTAMP);`);
        const classified = await classifyBenefitForAnnualReport(f.connection, f.actor, { ruleId: "annual-benefit", classification: "EXEMPTION", expectedVersion: 0, reason: "Classificação conferida" });
        assert.equal(classified.version, 1); assert.equal(annualObject(classified.data).previousId, null);
        await assert.rejects(classifyBenefitForAnnualReport(f.connection, f.actor, { ruleId: "annual-benefit", classification: "OTHER", expectedVersion: 0, reason: "Versão antiga" }), /Classificação alterada/);
        const next = await classifyBenefitForAnnualReport(f.connection, f.actor, { ruleId: "annual-benefit", classification: "IMMUNITY", expectedVersion: 1, reason: "Revisão fundamentada" });
        assert.equal(annualObject(next.data).previousId, classified.id); assert.equal((await registry("annual-benefit", "BENEFIT_REPORT_CLASSIFICATION")).length, 2);
        await assert.rejects(f.database.query('UPDATE "TaxRegistryEntry" SET title=\'Outro\' WHERE id=$1', [classified.id]), /imutável/);
        const filters = { governmentEntityId: scope.governmentEntityId, taxId: "ta-iss", firstYear: 2025, secondYear: 2026 };
        const report = await readAnnualTaxComparison(f.connection, f.actor, filters);
        assert.equal(report.rows.length, 1); assert.equal(report.second.paid, "40.00"); assert.equal(report.second.outstanding, "100.00"); assert.equal(report.second.guides, 1);
        assert.equal(report.rows[0].change?.percentage, "50");
        assert.equal((await readAnnualTaxComparison(f.connection, f.actor, { ...filters, minimumPercentage: "51" })).rows.length, 0);
        const summary = await readAnnualTaxSummary(f.connection, f.actor, { ...scope, taxId: "ta-iss", year: 2026, kind: "ALL" });
        assert.equal(summary.rows[0].net, "150.00"); assert.equal(summary.rows[0].paid, "40.00"); assert.equal(summary.rows[0].compensated, "10.00"); assert.equal(summary.rows[0].balance, "100.00"); assert.equal(summary.rows[0].overdue, "100.00");
        assert.equal(summary.rows[0].assessed, "160.00"); assert.equal(summary.rows[0].cancelled, 1);
        assert.equal(summary.rows[0].cancelledGuides, 1); assert.equal(summary.rows[0].immunities, "10.00"); assert.equal(summary.rows[0].exemptions, "0.00");
        await assert.rejects(readAnnualTaxSummary(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, { ...scope, taxId: "ta-iss", year: 2026, kind: "ALL" }), /autorizado/);
        await assert.rejects(readAnnualTaxComparison(f.connection, { allowedBudgetUnitIds: [] }, filters), /autorizado/);
        await f.database.exec(`INSERT INTO "RealEstate" (id,"municipalInsc","updatedAt") VALUES ('annual-compare-property','ANNUAL-COMPARE',CURRENT_TIMESTAMP);
          UPDATE "TaxAssessment" SET "realEstateId"='annual-compare-property' WHERE id IN ('annual-report-2025','annual-report-2026');
          INSERT INTO "PropertyValuation" (id,"realEstateId",year,"venalValueDecimal",source,"updatedAt") VALUES ('annual-venal-2025','annual-compare-property',2025,1000,'Avaliação 2025',CURRENT_TIMESTAMP),('annual-venal-2026','annual-compare-property',2026,1200,'Avaliação 2026',CURRENT_TIMESTAMP);`);
        const venal = await readAnnualTaxComparison(f.connection, f.actor, { ...filters, metric: "VENAL" });
        assert.equal(venal.rows[0].comparedFirst, "1000.00"); assert.equal(venal.rows[0].comparedSecond, "1200.00"); assert.equal(venal.rows[0].change?.percentage, "20");
        await f.database.exec('UPDATE "TaxAssessment" SET "finalValueDecimal"=NULL WHERE id=\'annual-report-2026\'');
        const pending = await readAnnualTaxComparison(f.connection, f.actor, filters);
        assert.equal(pending.second.pendingDecimal, 1); assert.equal(pending.rows[0].change, null);
        await assert.rejects(readAnnualTaxSummary(f.connection, f.actor, { ...scope, taxId: "ta-iss", year: 2026, kind: "ALL" }), /conciliação Decimal/);
      });

      await t.test("cron revalidates actor/profile/module/create+update/explicit UGs, processes only due owned pending items and resumes", async () => {
        await assert.rejects(processTaxAnnualCron(f.connection, undefined), /não configurado/);
        await assert.rejects(processTaxAnnualCron(f.connection, f.actor.usuarioId), /indisponível/);
        await f.database.exec(`UPDATE "Usuario" SET "firebaseUid"='annual-job-uid' WHERE id='ta-user';
          INSERT INTO "ConfiguracaoModulo" (id,codigo,nome,ativo,"updatedAt") VALUES ('annual-module','TRIBUTACAO','Tributação',true,CURRENT_TIMESTAMP) ON CONFLICT (codigo) DO UPDATE SET ativo=true;
          INSERT INTO "UsuarioModulo" (id,"usuarioId","moduloId","canView","canEdit") SELECT 'annual-user-module','ta-user',id,true,true FROM "ConfiguracaoModulo" WHERE codigo='TRIBUTACAO';
          INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('annual-user-unit','ta-user','ta-unit');
          INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('annual-cron-target','PF',CURRENT_TIMESTAMP);`);
        const batch = await simulateTaxAnnualBatch(f.connection, f.actor, { ...input, targets: [{ targetId: "annual-cron-target", taxableBase: "100" }], idempotencyKey: "annual-cron" });
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: batch.id, scheduledAt: new Date("2200-01-01") });
        assert.equal((await processTaxAnnualCron(f.connection, " ta-user ")).results.some(row => row.batchId === batch.id), false);
        await queueTaxAnnualBatch(f.connection, f.actor, { ...queue, batchId: batch.id });
        const result = await processTaxAnnualCron(f.connection, f.actor.usuarioId);
        assert.equal(result.actorId, f.actor.usuarioId); assert.equal(result.results.find(row => row.batchId === batch.id)?.processed, 1);
        assert.equal((await readAnnualBatch(f.db, batch.id)).status, "COMPLETED");
        assert.equal((await processTaxAnnualCron(f.connection, f.actor.usuarioId)).results.some(row => row.batchId === batch.id), false);
        await f.database.exec('UPDATE "UsuarioModulo" SET "canEdit"=false WHERE id=\'annual-user-module\'');
        await assert.rejects(processTaxAnnualCron(f.connection, f.actor.usuarioId), /criação\/alteração/);
        assert.equal((await readAnnualBatch(f.db, batchId)).status, "COMPLETED");
      });
    } finally { await f.close(); }
  });
}
