import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { assertCostScope, MunicipalCostError } from "../src/lib/financeiro/cost-ledger";
import { resolveFinancialReportScope } from "../src/lib/financeiro/report-scope";
import { defineMunicipalFiscalIndex, readMunicipalFiscalIndex, type FiscalIndexDefinition } from "../src/lib/financeiro/fiscal-indices";
import { readMunicipalCosts } from "../src/lib/financeiro/cost-overview";
import { createLegacyExpenseInTransaction } from "../src/lib/financeiro/legacy-expense";
import { createFinanceReportingDrizzleFixture } from "./helpers/finance-reporting-drizzle-fixture";

test("shared financial Drizzle contracts preserve scope, dated Decimal facts and caller transaction", async t => {
  const f = await createFinanceReportingDrizzleFixture();
  const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-2"] };
  const through = new Date("2026-01-31T23:59:59.999Z");
  try {
    await t.test("report and cost scopes intersect authorized UGs, deny empty scope and observe uncommitted facts", async () => {
      const db = f.connection.db;
      assert.equal((await resolveFinancialReportScope(db, "ano")).fullEntity, true);
      assert.deepEqual((await resolveFinancialReportScope(db, "ano", { budgetUnitId: "ug-2", budgetUnitIds: ["ug"] })).budgetUnitIds, []);
      assert.deepEqual((await resolveFinancialReportScope(db, "ano", { budgetUnitIds: [] })).budgetUnitIds, []);
      await assert.rejects(resolveFinancialReportScope(db, "ano", { governmentEntityId: "camara" }), /diverge/);
      await assert.rejects(resolveFinancialReportScope(db, "legado", { governmentEntityId: "ente" }), /legado/);
      await assert.rejects(assertCostScope(db, { ...actor, allowedBudgetUnitIds: [] }, "ano"), MunicipalCostError);
      await assert.rejects(assertCostScope(db, { ...actor, allowedBudgetUnitIds: ["ug"] }, "ano", null, true), /autorizadas/);
      await assert.rejects(assertCostScope(db, actor, "ano", "leg"), /não pertence/);
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await tx.execute(sql`UPDATE "FinancialYear" SET year=2027 WHERE id='ano'`);
        assert.equal((await resolveFinancialReportScope(tx, "ano")).year, 2027);
        const year = await assertCostScope(tx, actor, "ano", "ug");
        assert.equal(year.year, 2027);
        assert.ok(year.startDate instanceof Date);
        throw new Error("rollback shared scope");
      }, { isolationLevel: "repeatable read" }), /rollback shared scope/);
      assert.equal((await assertCostScope(db, actor, "ano")).year, 2026);
    });

    await t.test("fiscal index preserves exact cents, reversal origins/functions and sees the supplied transaction", async () => {
      const definition: FiscalIndexDefinition = {
        numerator: [{ label: "Aplicação em saúde", accountIds: ["debito"], side: "DEBIT_NET", operation: "ADD", functionCodes: ["10"], sourceTypes: ["COMMITMENT"] }],
        denominator: [{ label: "Base", accountIds: ["credito"], side: "CREDIT_NET", operation: "ADD" }],
      };
      const record = await defineMunicipalFiscalIndex(f.connection, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", legalReference: "Composição da fixture", minimumPercentage: "15", effectiveFrom: new Date("2026-01-01"), reason: "Composição fiscal explícita", definition });
      assert.equal(record.minimumPercentage.toFixed(4), "15.0000");
      assert.equal(record.effectiveFrom.toISOString(), "2026-01-01T00:00:00.000Z");
      const result = await withDatabaseTransaction(f.connection, tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through }), { isolationLevel: "repeatable read" });
      assert.equal(result.numerator, "90071992547409.93");
      assert.equal(result.denominator, "900719925474099.30");
      assert.equal(result.percentage, "10.0000");
      assert.equal(result.status, "IRREGULAR");
      assert.deepEqual(result.rows[0].entryIds, ["e1", "e3"]);
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await tx.execute(sql`UPDATE "MunicipalFiscalIndexDefinition" SET "minimumPercentage"=5 WHERE id=${record.id}`);
        assert.equal((await readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through })).status, "REGULAR");
        throw new Error("rollback fiscal composition");
      }, { isolationLevel: "repeatable read" }), /rollback fiscal composition/);
      assert.equal((await readMunicipalFiscalIndex(f.connection.db, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through })).status, "IRREGULAR");
      await assert.rejects(readMunicipalFiscalIndex(f.connection.db, { ...actor, allowedBudgetUnitIds: ["ug"] }, { financialYearId: "ano", code: "HEALTH_MINIMUM", through }), /todas/);
      const legislative = await readMunicipalFiscalIndex(f.connection.db, { ...actor, allowedBudgetUnitIds: ["leg"] }, { financialYearId: "legislativo", code: "HEALTH_MINIMUM", through });
      assert.equal(legislative.status, "NOT_EVALUATED");
      assert.equal(legislative.percentage, null);
    });

    await t.test("cost read keeps current pending balance apart from appropriation period and prior-year corrections", async () => {
      const data = await readMunicipalCosts(f.connection, { ...actor, allowedBudgetUnitIds: ["ug"] }, "ano", { appropriationFrom: new Date("2026-01-01"), appropriationUntil: through });
      assert.equal(data.sources.length, 1);
      assert.equal(data.sources[0].amount, "100.01");
      assert.equal(data.sources[0].netAmount, "100.00");
      assert.equal(data.sources[0].allocated, "40.01");
      assert.equal(data.sources[0].inPeriod, "30.01");
      assert.equal(data.sources[0].pending, "59.99");
      assert.equal(data.sources[0].movements.find(row => row.id === "m2")?.correctionId, "m3");
      assert.deepEqual(data.byType, [{ type: "SETTLEMENT", expense: "100.00", allocated: "30.01", pending: "59.99" }]);
      assert.equal(data.priorYearCorrections[0].amount, "-3.34");
      assert.equal(data.objects[0].links[0].id, "relacao");
    });

    await t.test("Social legacy Expense insert preserves Float and status and rolls back with its owner", async () => {
      const input = { description: "Despesa social legada", value: 12.3456, appropriationId: "dotacao", secretariatId: "secretaria" };
      const id = await withDatabaseTransaction(f.connection, async tx => {
        await tx.execute(sql`INSERT INTO "SocialBenefit" VALUES ('beneficio')`);
        return createLegacyExpenseInTransaction(tx, { ...input, socialBenefitId: "beneficio" });
      });
      const [expense] = (await f.pg.query<{ value: number; valueDecimal: string | null; status: string; socialBenefitId: string; sourceModule: string; requestedById: string | null }>('SELECT value, "valueDecimal", status, "socialBenefitId", "sourceModule", "requestedById" FROM "Expense" WHERE id=$1', [id])).rows;
      assert.equal(expense.value, 12.3456);
      assert.equal(expense.valueDecimal, null);
      assert.equal(expense.status, "Empenhada");
      assert.equal(expense.socialBenefitId, "beneficio");
      assert.equal(expense.sourceModule, "MANUAL");
      assert.equal(expense.requestedById, null);
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await tx.execute(sql`INSERT INTO "SocialProgram" VALUES ('programa-rollback')`);
        await createLegacyExpenseInTransaction(tx, { ...input, socialProgramId: "programa-rollback" });
        throw new Error("rollback Social owner");
      }), /rollback Social owner/);
      assert.equal((await f.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM "Expense"')).rows[0].total, 1);
      assert.equal((await f.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM "SocialProgram"')).rows[0].total, 0);
    });
  } finally { await f.close(); }
});
