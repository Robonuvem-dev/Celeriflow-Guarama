import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { financialYears } from "../src/db/schema/finance-years";
import { taxes } from "../src/db/schema/taxation-core";
import { catalogParameters } from "../src/db/schema/tax-catalog-rules";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { createTaxResidualFixture } from "./helpers/tax-residual-drizzle-fixture";
import { configureTaxFinancialMapping } from "../src/lib/tributacao";
import { copyTaxAnnualRule } from "../src/lib/tributacao/annual-rollover";
import { evaluateFiscalRule, parseFiscalRuleConfiguration } from "../src/lib/tributacao/fiscal-engine";

test("Calendário: virada de ano bissexto exige ajuste da cota, conserva condição e divide centavos sem parcela abaixo do mínimo", async () => {
  const f = await createTaxResidualFixture(2028);
  try {
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await f.db.insert(financialYears).values({ id: "next-year", governmentEntityId: "ente", year: 2029, startDate: new Date("2029-01-01"), endDate: new Date("2029-12-31"), status: "Preparação" });
    await f.db.insert(taxes).values({ id: "annual", name: "ISS anual", taxType: "Imposto" });
    await configureTaxFinancialMapping(f.connection, f.actor, { taxId: "annual", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    const option = { code: "UNICA", name: "Cota única", dueDate: "2028-02-29", discountPercent: "5", debtCheck: "ALL", debtTaxIds: ["annual"], legalBasis: "Lei municipal informada" };
    const configuration = { formula: "VALOR_FIXO", fixedValue: "100.01", installments: 4, minimumInstallmentValue: "30", calendar: ["2028-03-10", "2028-04-10", "2028-05-10", "2028-06-10"], paymentOptions: [option] };
    const [source] = await f.db.insert(catalogParameters).values({ id: "annual-source", taxId: "annual", code: "ANUAL", name: "ISS anual", calculationType: "VALOR_FIXO", configuration, effectiveFrom: new Date("2028-01-01"), effectiveUntil: new Date("2028-12-31T23:59:59.999Z") }).returning();
    await f.db.insert(taxRegistryEntries).values({ entityType: "TAX_PARAMETER", entityId: source.id, category: "PARAMETER_SCOPE", title: "Origem conferida", data: { governmentEntityId: "ente", budgetUnitId: "ug" } });
    const input = { taxId: "annual", parameterId: source.id, sourceYear: 2028, targetYear: 2029, calendar: ["2029-03-10", "2029-04-10", "2029-05-10", "2029-06-10"], legalBasis: "Lei municipal para o novo exercício", reference: "Calendário municipal", reason: "Virada anual conferida e autorizada", idempotencyKey: "annual-leap" };
    await assert.rejects(copyTaxAnnualRule(f.connection, f.actor, input), /29 de fevereiro/);
    assert.equal((await f.db.select({ total: count() }).from(catalogParameters))[0].total, 1);
    await assert.rejects(copyTaxAnnualRule(f.connection, f.actor, { ...input, paymentOptionDates: { INEXISTENTE: "2029-02-28" } }), /opções existentes/);
    const copied = await copyTaxAnnualRule(f.connection, f.actor, { ...input, paymentOptionDates: { UNICA: "2029-02-28" } });
    assert.deepEqual((copied.configuration as { paymentOptions: object[] }).paymentOptions, [{ ...option, dueDate: "2029-02-28" }]);
    assert.deepEqual((await f.db.select().from(catalogParameters).where(eq(catalogParameters.id, source.id)))[0].configuration, configuration);
    const result = evaluateFiscalRule({ taxableBase: "1", configuration: parseFiscalRuleConfiguration(copied.configuration) });
    assert.equal(result.schedule.length, 3);
    assert.deepEqual(result.schedule.map(row => row.amount.toFixed(2)), ["33.33", "33.33", "33.35"]);
    assert.equal(result.schedule.reduce((sum, row) => sum.plus(row.amount), result.principal.mul(0)).toFixed(2), "100.01");
  } finally { await f.close(); }
});
