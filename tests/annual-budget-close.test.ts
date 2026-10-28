import assert from "node:assert/strict";
import test from "node:test";
import { count, eq, inArray } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { JsonObject } from "../src/db/json";
import { accountingEntries, accountingPlans, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { executeAnnualBalanceStage, undoAnnualBudgetStage, undoAnnualResultStage } from "../src/lib/financeiro/annual-balance-stages";
import { finalizeAnnualAccountingClose, prepareAnnualAccountingClose, postAccountingTransaction } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Encerramento orçamentário ${jurisdiction}: classes 5/6, IC histórica, replay e desmovimentação independente`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      await db.insert(accountingPlans).values([{ id: "budget-5", code: "BUDGET.APPROVAL", name: "Aprovação orçamentária", type: "Orçamento" }, { id: "budget-6", code: "BUDGET.EXECUTION", name: "Execução orçamentária", type: "Orçamento" }, { id: "persistent-7", code: "CONTROL.7", name: "Controle de origem", type: "Controle" }, { id: "persistent-8", code: "CONTROL.8", name: "Controle de execução", type: "Controle" }]);
      for (const [source, value] of [["livre", "3.25"], ["vinculada", "1.50"]]) {
        const date = new Date("2026-09-01");
        const dimensions = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: source, sourceClassification: null, budgetDimensions: { expenseNatureCode: "339030" } };
        await db.transaction(async tx => {
          await tx.insert(accountingTransactions).values({ id: `budget:${source}`, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Orçamento da fonte", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
          await tx.insert(accountingEntries).values([
            { id: `budget-debit:${source}`, transactionId: `budget:${source}`, date, accountId: "budget-5", type: "Débito", value: Number(value), valueDecimal: new Decimal(value), authorId: actor.employeeId!, history: "Aprovação", classificationSnapshot: { externalCode: "5.2.2.1.1", dimensions: { ...dimensions, msc: { status: "DOCUMENTED", accountCode: "522110000", information: { FR: source === "livre" ? "1500" : "1501", PO: jurisdiction } } } } },
            { id: `budget-credit:${source}`, transactionId: `budget:${source}`, date, accountId: "budget-6", type: "Crédito", value: Number(value), valueDecimal: new Decimal(value), authorId: actor.employeeId!, history: "Execução", classificationSnapshot: { externalCode: "6.2.2.1.1", dimensions: { ...dimensions, msc: { status: "DOCUMENTED", accountCode: "622110000", information: { FR: source === "livre" ? "1500" : "1501", PO: jurisdiction } } } } },
          ]);
        });
      }
      const date = new Date("2026-09-01");
      await db.transaction(async tx => {
        await tx.insert(accountingTransactions).values({ id: "persistent-controls", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Controle persistente", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
        await tx.insert(accountingEntries).values([
          { transactionId: "persistent-controls", date, accountId: "persistent-7", type: "Débito", value: 2, valueDecimal: new Decimal("2.00"), authorId: actor.employeeId!, history: "Controle", classificationSnapshot: { externalCode: "7.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null, msc: null } } },
          { transactionId: "persistent-controls", date, accountId: "persistent-8", type: "Crédito", value: 2, valueDecimal: new Decimal("2.00"), authorId: actor.employeeId!, history: "Controle", classificationSnapshot: { externalCode: "8.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null, msc: null } } },
        ]);
      });
      const input = { stage: "BUDGET_CLOSE" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "", reason: "Encerramento das classes orçamentárias", requestKey: "budget-close-1" };
      await assert.rejects(executeAnnualBalanceStage(connection, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualBalanceStage(connection, actor, input), /doze competências/);
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      await prepareAnnualAccountingClose(connection, actor, "ano");
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /classes 5\/6/);
      const persistent = () => db.select().from(accountingEntries).where(inArray(accountingEntries.accountId, ["persistent-7", "persistent-8"]));
      const persistentBefore = JSON.stringify(await persistent());
      const concurrent = await Promise.all([executeAnnualBalanceStage(connection, actor, input), executeAnnualBalanceStage(connection, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const closing = concurrent.find(result => !result.replay)!;
      const lines = await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(eq(accountingTransactions.sourceId, closing.editionId)).then(rows => rows.map(row => row.entry));
      assert.equal(lines.length, 4);
      for (const line of lines) {
        const snapshot = line.classificationSnapshot as JsonObject;
        const [original] = await db.select().from(accountingEntries).where(eq(accountingEntries.id, String(snapshot.annualBalanceOriginEntryId)));
        assert.ok(original);
        assert.deepEqual((snapshot.dimensions as JsonObject).msc, ((original.classificationSnapshot as JsonObject).dimensions as JsonObject).msc);
        assert.equal(line.type, original.type === "Débito" ? "Crédito" : "Débito");
      }
      assert.equal(JSON.stringify(await persistent()), persistentBefore);
      await assert.rejects(undoAnnualResultStage(connection, actor, { editionId: closing.editionId, reason: "Etapa divergente" }), /compatível/);
      await assert.rejects(executeAnnualBalanceStage(connection, actor, { ...input, requestKey: "duplicate-budget-close" }), /Desmovimente/);
      await assert.rejects(postAccountingTransaction(connection, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-12-31T23:59:59.999Z"), history: "Tentativa anual sem memória", sourceModule: "FINANCEIRO", eventType: "ANNUAL_BUDGET_CLOSE", lines: [{ accountId: "budget-5", type: "Crédito", value: "1.00" }, { accountId: "budget-6", type: "Débito", value: "1.00" }] }), /não está aberto/);
      await undoAnnualBudgetStage(connection, actor, { editionId: closing.editionId, reason: "Revisão independente do orçamento" });
      assert.equal((await undoAnnualBudgetStage(connection, actor, { editionId: closing.editionId, reason: "Revisão independente do orçamento" })).replay, true);
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /classes 5\/6/);
      const repeated = await executeAnnualBalanceStage(connection, actor, { ...input, requestKey: "budget-close-2" });
      await finalizeAnnualAccountingClose(connection, reviewer, "ano");
      await assert.rejects(undoAnnualBudgetStage(connection, actor, { editionId: repeated.editionId, reason: "Após validação final" }), /anterior à validação final/);
      assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Encerrado");
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });

  test(`Encerramento orçamentário ${jurisdiction}: desequilíbrio por fonte bloqueia edição inteira`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await db.update(financialYears).set({ status: "Em Encerramento" }).where(eq(financialYears.id, "ano"));
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      await db.insert(accountingPlans).values([{ id: "budget-5", code: "BUDGET.APPROVAL", name: "Aprovação", type: "Orçamento" }, { id: "budget-6", code: "BUDGET.EXECUTION", name: "Execução", type: "Orçamento" }]);
      const date = new Date("2026-09-01");
      await db.transaction(async tx => {
        await tx.insert(accountingTransactions).values({ id: "mismatched-budget", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Origem com fontes divergentes", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
        await tx.insert(accountingEntries).values([
          { transactionId: "mismatched-budget", date, accountId: "budget-5", type: "Débito", value: 3, valueDecimal: new Decimal("3.00"), authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "5.2.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null } } },
          { transactionId: "mismatched-budget", date, accountId: "budget-6", type: "Crédito", value: 3, valueDecimal: new Decimal("3.00"), authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "6.2.2.1.1", dimensions: { resourceSourceId: "vinculada", budgetDimensions: null } } },
        ]);
      });
      const before = { audits: (await db.select({ total: count() }).from(financialAuditLogs))[0].total, transactions: (await db.select({ total: count() }).from(accountingTransactions))[0].total };
      await assert.rejects(executeAnnualBalanceStage(connection, actor, { stage: "BUDGET_CLOSE", sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "", reason: "Conferência segregada", requestKey: "unbalanced-budget" }), /desequilibrado por UG\/fonte/);
      assert.equal((await db.select({ total: count() }).from(financialAuditLogs))[0].total, before.audits);
      assert.equal((await db.select({ total: count() }).from(accountingTransactions))[0].total, before.transactions);
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
