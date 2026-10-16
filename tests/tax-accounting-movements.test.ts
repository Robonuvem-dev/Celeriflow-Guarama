import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { readTaxAccountingMovements } from "../src/lib/tributacao/accounting-movements";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`consulta fiscal: origens canônicas, estorno e recorte de linhas (${jurisdiction})`, async () => {
    const fixture = await createPlanningAccountingFixture(jurisdiction);
    try {
      await fixture.rules();
      await fixture.db.tax.createMany({ data: [{ id: "iptu", name: "IPTU", taxType: "Imposto" }, { id: "iss", name: "ISS", taxType: "Imposto" }] });
      await fixture.db.taxAssessment.createMany({ data: [{ id: "assessment-iptu", year: 2026, originalValue: 10, originalValueDecimal: "10.00", taxId: "iptu", taxpayerId: "contribuinte" }, { id: "assessment-iss", year: 2026, originalValue: 20, originalValueDecimal: "20.00", taxId: "iss", taxpayerId: "contribuinte" }] });
      await fixture.db.taxGuide.create({ data: { id: "guide", assessmentId: "assessment-iptu", totalValue: 10, totalValueDecimal: "10.00", dueDate: new Date("2026-01-31") } });
      await fixture.db.taxPayment.create({ data: { id: "payment", guideId: "guide", amountPaid: 10, amountPaidDecimal: "10.00", paymentDate: new Date("2026-01-31"), paymentMethod: "Manual" } });
      await fixture.db.taxRevenueIntegrationEvent.create({ data: { taxPaymentId: "payment", revenueId: "canonical-receipt", idempotencyKey: "payment-link" } });
      await fixture.db.taxRegistryEntry.createMany({ data: [
        { id: "credit", entityType: "TAXPAYER", entityId: "contribuinte", category: "TAX_CREDIT", title: "Excedente", data: { originGuideId: "guide" } },
        { id: "refund", entityType: "TAXPAYER", entityId: "contribuinte", category: "REFUND_REQUEST", title: "Restituição", data: { sourceCreditId: "credit" } },
        { id: "compensation", entityType: "TAX_ASSESSMENT", entityId: "assessment-iss", category: "CREDIT_MOVEMENT", title: "Compensação", data: { sourceCreditId: "credit", accountingTransactionId: "compensation-posting" } },
      ] });
      const seed = async (id: string, sourceType: string, sourceId: string, value: string, extra: { sourceModule?: string; budgetUnitId?: string; reversalOfId?: string } = {}) => fixture.db.accountingTransaction.create({ data: { id, date: new Date("2026-01-31T23:59:59.999Z"), financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", history: id, authorUsuarioId: "ana", status: "POSTADO", sourceModule: "TRIBUTACAO", sourceType, sourceId, eventType: id, ...extra, entries: { create: ["debito", "credito"].map(accountId => ({ accountId, date: new Date("2026-01-31"), type: accountId === "debito" ? "Débito" : "Crédito", value: Number(value), valueDecimal: value, history: id, authorId: "servidora-ana", classificationSnapshot: { externalCode: accountId === "debito" ? "111110100" : "211110101" } })) } } });
      await seed("assessment-posting", "TAX_ASSESSMENT", "assessment-iptu", "10.00");
      await seed("receipt-posting", "TAX_PAYMENT", "canonical-receipt", "10.00", { sourceModule: "TRIBUTARIO" });
      await seed("refund-posting", "TAX_REFUND", "refund", "1.00");
      await seed("refund-reversal", "TAX_REFUND_REVERSAL", "refund", "1.00", { reversalOfId: "refund-posting" });
      await seed("compensation-posting", "TAX_CREDIT_COMPENSATION", "credit", "1.00");
      await seed("restricted", "TAX_ASSESSMENT", "assessment-iptu", "999.99", { budgetUnitId: "ug-restrita" });
      await seed("iss-only", "TAX_ASSESSMENT", "assessment-iss", "20.00");
      await fixture.db.taxAssessment.update({ where: { id: "assessment-iptu" }, data: { calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } } });
      await fixture.db.taxPayment.create({ data: { id: "pending-payment", idempotencyKey: "pending-bank-return", guideId: "guide", amountPaid: 2, amountPaidDecimal: "2.00", paymentDate: new Date("2026-01-31"), paymentMethod: "Manual" } });
      await fixture.db.taxIntegrationEvent.createMany({ data: [
        { id: "pending-return", integrationCode: "BANK_RETURN", eventType: "PAYMENT", idempotencyKey: "pending-bank-return", status: "PROCESSADO", payload: { amount: "2.00", occurredAt: "2026-01-31T12:00:00.000Z" } },
        { id: "pending-reference", integrationCode: "ACCOUNTING", eventType: "ARRECADACAO", idempotencyKey: "pending-accounting-reference", status: "PENDENTE", payload: { sourceId: "pending-return", amount: "2.00", competence: "2026-01-31T12:00:00.000Z" } },
        { id: "invalid-reference", integrationCode: "ACCOUNTING", eventType: "ARRECADACAO", idempotencyKey: "invalid-accounting-reference", status: "PENDENTE", payload: { sourceId: "pending-return", amount: "999.99", competence: "2026-01-31T12:00:00.000Z" } },
      ] });
      const input = { governmentEntityId: "ente", financialYearId: "ano", taxId: "iptu", through: "2026-01-31" };
      const actor = { allowedBudgetUnitIds: ["ug"] };
      const report = await readTaxAccountingMovements(fixture.db, actor, input);
      assert.equal(report.total, 5);
      assert.equal(report.availableTotal, 1);
      assert.equal(report.available[0].amount, "2.00");
      assert.equal(report.available[0].id, "pending-reference");
      // Once a canonical revenue exists, an absent year cannot be filled from today's assessment metadata.
      await fixture.db.revenue.create({ data: { id: "pending-receipt", value: 2, valueDecimal: "2.00", budgetUnitId: "ug", revenueNatureId: "receita", resourceSourceId: "livre", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: "pending-payment" } });
      await fixture.db.taxRevenueIntegrationEvent.create({ data: { taxPaymentId: "pending-payment", revenueId: "pending-receipt", idempotencyKey: "pending-payment-link" } });
      assert.equal((await readTaxAccountingMovements(fixture.db, actor, input)).availableTotal, 0);
      await fixture.db.revenue.update({ where: { id: "pending-receipt" }, data: { financialYearId: "ano" } });
      assert.equal((await readTaxAccountingMovements(fixture.db, actor, input)).availableTotal, 1);
      assert.ok(report.transactions.some(row => row.id === "receipt-posting"));
      assert.ok(report.transactions.some(row => row.id === "refund-reversal"));
      assert.ok(!report.transactions.some(row => row.id === "restricted"));
      const selected = await readTaxAccountingMovements(fixture.db, actor, { ...input, account: "111110100", minimum: "10.00", maximum: "10.00" });
      assert.equal(selected.total, 2);
      assert.equal(selected.availableTotal, 0);
      assert.ok(selected.transactions.every(row => row.entries.length === 1 && row.entries[0].amount === "10.00"));
      const destinationTax = await readTaxAccountingMovements(fixture.db, actor, { ...input, taxId: "iss" });
      assert.equal(destinationTax.total, 2);
      assert.equal(destinationTax.availableTotal, 0);
      assert.equal((await readTaxAccountingMovements(fixture.db, { allowedBudgetUnitIds: ["ug-restrita"] }, input)).availableTotal, 0);
      assert.equal((await readTaxAccountingMovements(fixture.db, actor, { ...input, through: "2026-01-30" })).availableTotal, 0);
      assert.ok(destinationTax.transactions.some(row => row.id === "compensation-posting"));
      await assert.rejects(readTaxAccountingMovements(fixture.db, { allowedBudgetUnitIds: [] }, input), /autoriz/);
      await assert.rejects(readTaxAccountingMovements(fixture.db, actor, { ...input, governmentEntityId: "outro" }), /diverge/);
      await assert.rejects(readTaxAccountingMovements(fixture.db, actor, { ...input, minimum: "2.00", maximum: "1.00" }), /mínimo/);
    } finally { await fixture.close(); }
  });
}
