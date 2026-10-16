import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { readAccountingMonthlySources } from "../src/lib/financeiro/accounting-monthly-sources";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`saldos mensais Decimal, fontes congeladas e ACL (${jurisdiction})`, async () => {
    const fixture = await createPlanningAccountingFixture(jurisdiction);
    try {
      await fixture.rules();
      const seed = async (id: string, date: string, sourceId: string, sourceCode: string, value: string, reverse = false, budgetUnitId = "ug", documented = true) => {
        const memory = (accountId: string): Prisma.InputJsonObject => ({ entryId: `catalog:${accountId}`, externalCode: accountId === "debito" ? "1.1.1.1.1.01.00" : "2.1.1.1.1.01.00", dimensions: { governmentEntityId: "ente", budgetUnitId, resourceSourceId: sourceId, sourceClassification: { externalCode: sourceCode } } });
        await fixture.db.accountingTransaction.create({ data: { id, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId, date: new Date(date), history: id, status: "POSTADO", sourceModule: "FINANCEIRO", sourceType: reverse ? "REVERSAL" : "MANUAL", eventType: "DOCUMENTED_EVENT", authorUsuarioId: "ana", authorEmployeeId: "servidora-ana", entries: { create: ["debito", "credito"].map(accountId => ({ accountId, date: new Date(date), type: (accountId === "debito") !== reverse ? "Débito" : "Crédito", value: Number(value), valueDecimal: value, history: id, authorId: "servidora-ana", ...(documented ? { classificationSnapshot: memory(accountId) } : {}) })) } } });
      };
      await seed("january", "2026-01-31T23:59:59.999Z", "livre", "1500", "0.10");
      await seed("february", "2026-02-01T00:00:00.000Z", "livre", "1500", "0.20");
      await seed("march-reversal", "2026-03-01T00:00:00.000Z", "livre", "1500", "0.10", true);
      await seed("second-source", "2026-02-28T12:00:00.000Z", "vinculada", "1600", "0.05");
      await seed("restricted", "2026-02-01T00:00:00.000Z", "livre", "1500", "999.99", false, "ug-restrita");
      // Changing today's source catalog cannot change an archived posting's code or grouping.
      await fixture.db.resourceSource.update({ where: { id: "livre" }, data: { code: "999", name: "Classificação posterior" } });
      const input = { financialYearId: "ano", governmentEntityId: "ente" };
      const report = await readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: ["ug"] }, input);
      assert.equal(report.entryCount, 8);
      assert.equal(report.fullEntity, false);
      assert.equal(report.undocumentedEntries, 0);
      const debit = report.rows.find(row => row.accountId === "debito" && row.sourceId === "livre")!;
      assert.equal(debit.sourceCode, "1500");
      assert.deepEqual(debit.months[0], { debit: "0.10", credit: "0.00", balance: "0.10" });
      assert.deepEqual(debit.months[1], { debit: "0.20", credit: "0.00", balance: "0.30" });
      assert.deepEqual(debit.months[2], { debit: "0.00", credit: "0.10", balance: "0.20" });
      assert.equal(debit.months[11].balance, "0.20");
      assert.equal(report.rows.find(row => row.accountId === "debito" && row.sourceId === "vinculada")!.months[11].balance, "0.05");
      assert.equal(report.rows.find(row => row.accountId === "credito" && row.sourceId === "livre")!.months[11].balance, "-0.20");
      await assert.rejects(readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: [] }, input), /autorizada/);
      await assert.rejects(readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: ["ug"] }, { ...input, budgetUnitId: "ug-restrita" }), /autorizada/);
      await assert.rejects(readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: ["ug"] }, { ...input, governmentEntityId: "outro-ente" }), /diverge/);
      await seed("legacy", "2026-04-01T00:00:00.000Z", "livre", "1500", "1.00", false, "ug", false);
      const incomplete = await readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: ["ug"] }, input);
      assert.equal(incomplete.undocumentedEntries, 2);
      assert.equal(incomplete.rows.find(row => row.accountId === "debito" && row.sourceId === null)!.months[11].balance, "1.00");
      assert.equal(incomplete.rows.find(row => row.accountId === "debito" && row.sourceId === "livre")!.months[11].balance, "0.20");
      await fixture.db.accountingEntry.updateMany({ where: { transactionId: "legacy", accountId: "debito" }, data: { valueDecimal: null } });
      await assert.rejects(readAccountingMonthlySources(fixture.db, { allowedBudgetUnitIds: ["ug"] }, input), /Decimal/);
    } finally { await fixture.close(); }
  });
}
