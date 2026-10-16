import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { executeAnnualBalanceStage, undoAnnualBudgetStage, undoAnnualResultStage } from "../src/lib/financeiro/annual-balance-stages";
import { finalizeAnnualAccountingClose, prepareAnnualAccountingClose, postAccountingTransaction } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Encerramento orçamentário ${jurisdiction}: classes 5/6, IC histórica, replay e desmovimentação independente`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      await f.db.accountingPlan.createMany({ data: [{ id: "budget-5", code: "BUDGET.APPROVAL", name: "Aprovação orçamentária", type: "Orçamento" }, { id: "budget-6", code: "BUDGET.EXECUTION", name: "Execução orçamentária", type: "Orçamento" }, { id: "persistent-7", code: "CONTROL.7", name: "Controle de origem", type: "Controle" }, { id: "persistent-8", code: "CONTROL.8", name: "Controle de execução", type: "Controle" }] });
      for (const [source, value] of [["livre", "3.25"], ["vinculada", "1.50"]]) {
        const date = new Date("2026-09-01");
        const dimensions = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: source, sourceClassification: null, budgetDimensions: { expenseNatureCode: "339030" } };
        await f.db.accountingTransaction.create({ data: { id: `budget:${source}`, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Orçamento da fonte", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, entries: { create: [
          { id: `budget-debit:${source}`, date, accountId: "budget-5", type: "Débito", value: Number(value), valueDecimal: value, authorId: actor.employeeId!, history: "Aprovação", classificationSnapshot: { externalCode: "5.2.2.1.1", dimensions: { ...dimensions, msc: { status: "DOCUMENTED", accountCode: "522110000", information: { FR: source === "livre" ? "1500" : "1501", PO: jurisdiction } } } } },
          { id: `budget-credit:${source}`, date, accountId: "budget-6", type: "Crédito", value: Number(value), valueDecimal: value, authorId: actor.employeeId!, history: "Execução", classificationSnapshot: { externalCode: "6.2.2.1.1", dimensions: { ...dimensions, msc: { status: "DOCUMENTED", accountCode: "622110000", information: { FR: source === "livre" ? "1500" : "1501", PO: jurisdiction } } } } },
        ] } } });
      }
      const date = new Date("2026-09-01");
      await f.db.accountingTransaction.create({ data: { id: "persistent-controls", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Controle persistente", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, entries: { create: [
        { date, accountId: "persistent-7", type: "Débito", value: 2, valueDecimal: "2.00", authorId: actor.employeeId!, history: "Controle", classificationSnapshot: { externalCode: "7.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null, msc: null } } },
        { date, accountId: "persistent-8", type: "Crédito", value: 2, valueDecimal: "2.00", authorId: actor.employeeId!, history: "Controle", classificationSnapshot: { externalCode: "8.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null, msc: null } } },
      ] } } });
      const input = { stage: "BUDGET_CLOSE" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "", reason: "Encerramento das classes orçamentárias", requestKey: "budget-close-1" };
      await assert.rejects(executeAnnualBalanceStage(f.db, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, input), /doze competências/);
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /classes 5\/6/);
      const persistentBefore = JSON.stringify(await f.db.accountingEntry.findMany({ where: { accountId: { in: ["persistent-7", "persistent-8"] } } }));
      const concurrent = await Promise.all([executeAnnualBalanceStage(f.db, actor, input), executeAnnualBalanceStage(f.db, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const closing = concurrent.find(result => !result.replay)!;
      const lines = await f.db.accountingEntry.findMany({ where: { transaction: { sourceId: closing.editionId } } });
      assert.equal(lines.length, 4);
      for (const line of lines) {
        const snapshot = line.classificationSnapshot as Prisma.JsonObject;
        const original = await f.db.accountingEntry.findUniqueOrThrow({ where: { id: String(snapshot.annualBalanceOriginEntryId) } });
        assert.deepEqual((snapshot.dimensions as Prisma.JsonObject).msc, ((original.classificationSnapshot as Prisma.JsonObject).dimensions as Prisma.JsonObject).msc);
        assert.equal(line.type, original.type === "Débito" ? "Crédito" : "Débito");
      }
      assert.equal(JSON.stringify(await f.db.accountingEntry.findMany({ where: { accountId: { in: ["persistent-7", "persistent-8"] } } })), persistentBefore);
      await assert.rejects(undoAnnualResultStage(f.db, actor, { editionId: closing.editionId, reason: "Etapa divergente" }), /compatível/);
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, { ...input, requestKey: "duplicate-budget-close" }), /Desmovimente/);
      await assert.rejects(postAccountingTransaction(f.db, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-12-31T23:59:59.999Z"), history: "Tentativa anual sem memória", sourceModule: "FINANCEIRO", eventType: "ANNUAL_BUDGET_CLOSE", lines: [{ accountId: "budget-5", type: "Crédito", value: "1.00" }, { accountId: "budget-6", type: "Débito", value: "1.00" }] }), /não está aberto/);
      await undoAnnualBudgetStage(f.db, actor, { editionId: closing.editionId, reason: "Revisão independente do orçamento" });
      assert.equal((await undoAnnualBudgetStage(f.db, actor, { editionId: closing.editionId, reason: "Revisão independente do orçamento" })).replay, true);
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /classes 5\/6/);
      const repeated = await executeAnnualBalanceStage(f.db, actor, { ...input, requestKey: "budget-close-2" });
      await finalizeAnnualAccountingClose(f.db, reviewer, "ano");
      await assert.rejects(undoAnnualBudgetStage(f.db, actor, { editionId: repeated.editionId, reason: "Após validação final" }), /anterior à validação final/);
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
    } finally { await f.close(); }
  });

  test(`Encerramento orçamentário ${jurisdiction}: desequilíbrio por fonte bloqueia edição inteira`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Em Encerramento" } });
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      await f.db.accountingPlan.createMany({ data: [{ id: "budget-5", code: "BUDGET.APPROVAL", name: "Aprovação", type: "Orçamento" }, { id: "budget-6", code: "BUDGET.EXECUTION", name: "Execução", type: "Orçamento" }] });
      const date = new Date("2026-09-01");
      await f.db.accountingTransaction.create({ data: { id: "mismatched-budget", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, status: "POSTADO", history: "Origem com fontes divergentes", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, entries: { create: [
        { date, accountId: "budget-5", type: "Débito", value: 3, valueDecimal: "3.00", authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "5.2.2.1.1", dimensions: { resourceSourceId: "livre", budgetDimensions: null } } },
        { date, accountId: "budget-6", type: "Crédito", value: 3, valueDecimal: "3.00", authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "6.2.2.1.1", dimensions: { resourceSourceId: "vinculada", budgetDimensions: null } } },
      ] } } });
      const before = { audits: await f.db.financialAuditLog.count(), transactions: await f.db.accountingTransaction.count() };
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, { stage: "BUDGET_CLOSE", sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "", reason: "Conferência segregada", requestKey: "unbalanced-budget" }), /desequilibrado por UG\/fonte/);
      assert.equal(await f.db.financialAuditLog.count(), before.audits);
      assert.equal(await f.db.accountingTransaction.count(), before.transactions);
    } finally { await f.close(); }
  });
}
