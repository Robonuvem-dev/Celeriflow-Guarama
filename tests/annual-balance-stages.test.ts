import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { JsonObject, JsonValue } from "../src/db/json";
import { accountingEntries, accountingPlans, accountingTransactions, annualAccountingCloses, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { executeAnnualBalanceStage, undoAnnualResultStage } from "../src/lib/financeiro/annual-balance-stages";
import { finalizeAnnualAccountingClose, postAccountingTransaction } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Etapas anuais ${jurisdiction}: abertura provisória, resultado e reedição preservam IC e movimento corrente`, async () => {
    const f = await createPlanningExecutionFixture(2025, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      await db.insert(financialYears).values({ id: "next", year: 2026, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") });
      await db.insert(accountingPlans).values({ id: "vpa", code: "ORIGIN.VPA", name: "VPA do exercício", type: "VPA" });
      await db.insert(accountingPlans).values({ id: "annual-asset", code: "ORIGIN.ASSET", name: "Direito patrimonial", type: "Ativo" });
      await db.insert(accountingPlans).values({ id: "annual-result", code: "ORIGIN.RESULT", name: "Resultado acumulado", type: "Passivo" });
      const ic = { status: "DOCUMENTED", informationPairs: 6, accountCode: "111110100", information: { PO: jurisdiction === "EXECUTIVE" ? "10131" : "20231", FP: "1", FR: "1500" }, pairs: [{ type: "FR", value: "1500" }] };
      const dimensions = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null, msc: ic };
      // Documentary prior-year journal, with immutable classifications captured before the annual service.
      await db.transaction(async tx => {
        await tx.insert(accountingTransactions).values({ id: "source-journal", date: new Date("2025-09-01"), financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", status: "POSTADO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, history: "Direito constituído na origem" });
        await tx.insert(accountingEntries).values([
          { id: "source-cash", transactionId: "source-journal", date: new Date("2025-09-01"), accountId: "annual-asset", type: "Débito", value: 30, valueDecimal: new Decimal("30.00"), authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "1.1.1.1.1.01", dimensions } },
          { id: "source-vpa", transactionId: "source-journal", date: new Date("2025-09-01"), accountId: "vpa", type: "Crédito", value: 30, valueDecimal: new Decimal("30.00"), authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "4.1.1.1", dimensions: { ...dimensions, msc: null } } },
        ]);
      });
      const openingInput = { stage: "OPENING" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "next", resultAccountId: "annual-result", reason: "Abertura patrimonial do novo exercício", requestKey: "opening-1" };
      await assert.rejects(postAccountingTransaction(connection, actor, { financialYearId: "next", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Origem anual sem edição", lines: [{ accountId: "annual-asset", type: "Débito", value: "30.00", annualBalanceOriginEntryId: "source-cash" }, { accountId: "annual-result", type: "Crédito", value: "30.00", annualBalanceOriginEntryId: "source-cash" }] }), /edição documental/);
      await assert.rejects(executeAnnualBalanceStage(connection, f.actor, openingInput), /todas as UGs/);
      const concurrentOpenings = await Promise.all([executeAnnualBalanceStage(connection, actor, openingInput), executeAnnualBalanceStage(connection, actor, openingInput)]);
      assert.equal(concurrentOpenings.filter(result => result.replay).length, 1);
      const opening = concurrentOpenings.find(result => !result.replay)!;
      assert.equal(opening.provisional, true);
      const [carried] = await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(eq(accountingEntries.accountId, "annual-asset"), eq(accountingTransactions.sourceId, opening.editionId))).limit(1);
      assert.ok(carried);
      assert.deepEqual(((carried.entry.classificationSnapshot as JsonObject).dimensions as JsonObject).msc, ic);
      const firstMemory = (await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, opening.editionId)))[0].payload as JsonObject;
      assert.equal((firstMemory.financialPosition as JsonObject).status, "NOT_RECONCILED", "As partidas orçamentárias anteriores da fixture não possuem indicador financeiro documental.");
      assert.equal((((firstMemory.financialPosition as JsonObject).rows as JsonValue[])[0] as JsonObject).deficitSurplus, "30.00");
      assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Aberto");
      const current = await postAccountingTransaction(connection, actor, { financialYearId: "next", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-09-01"), history: "Atividade corrente com exercício anterior aberto", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "banco", idempotencyKey: "current", lines: [{ accountId: "annual-asset", type: "Débito", value: "5.00" }, { accountId: "annual-result", type: "Crédito", value: "5.00" }] });
      await postAccountingTransaction(connection, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2025-12-30"), history: "Ajuste anterior ao encerramento", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "banco", idempotencyKey: "source-adjustment", lines: [{ accountId: "annual-asset", type: "Débito", value: "2.00" }, { accountId: "vpa", type: "Crédito", value: "2.00" }] });
      const closeInput = { stage: "RESULT_CLOSE" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "annual-result", reason: "Apuração patrimonial do resultado", requestKey: "result-close-1" };
      await assert.rejects(executeAnnualBalanceStage(connection, actor, closeInput), /doze competências/);
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2025, month, 1)), status: "FECHADO" })));
      await db.update(financialYears).set({ status: "Em Encerramento" }).where(eq(financialYears.id, "ano"));
      await db.insert(annualAccountingCloses).values({ financialYearId: "ano", status: "PRONTO_PARA_VALIDACAO", preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() });
      await assert.rejects(finalizeAnnualAccountingClose(connection, { ...actor, usuarioId: "beatriz" }, "ano"), /saldos de VPD\/VPA/);
      const closing = await executeAnnualBalanceStage(connection, actor, closeInput);
      assert.equal(closing.replay, false);
      await assert.rejects(undoAnnualResultStage(connection, f.actor, { editionId: closing.editionId, reason: "Conferência" }), /todas as UGs/);
      const undone = await undoAnnualResultStage(connection, actor, { editionId: closing.editionId, reason: "Revisão documental da apuração" });
      assert.equal(undone.replay, false);
      assert.equal((await undoAnnualResultStage(connection, actor, { editionId: closing.editionId, reason: "Revisão documental da apuração" })).replay, true);
      const newClosing = await executeAnnualBalanceStage(connection, actor, { ...closeInput, requestKey: "result-close-2" });
      const vpa = await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(eq(accountingEntries.accountId, "vpa"), eq(accountingTransactions.financialYearId, "ano"), eq(accountingTransactions.status, "POSTADO"))).then(rows => rows.map(row => row.entry));
      assert.equal(vpa.reduce((sum, entry) => entry.type === "Débito" ? sum.plus(entry.valueDecimal!) : sum.minus(entry.valueDecimal!), new Decimal(0)).toFixed(2), "0.00");
      await executeAnnualBalanceStage(connection, actor, { ...openingInput, requestKey: "opening-after-result" });
      await assert.rejects(undoAnnualResultStage(connection, actor, { editionId: newClosing.editionId, reason: "Revisão após abertura dependente" }), /abertura posterior dependente/);
      await finalizeAnnualAccountingClose(connection, { ...actor, usuarioId: "beatriz" }, "ano");
      const updated = await executeAnnualBalanceStage(connection, actor, { ...openingInput, requestKey: "opening-2" });
      assert.equal(updated.provisional, false);
      await assert.rejects(undoAnnualResultStage(connection, actor, { editionId: newClosing.editionId, reason: "Revisão após encerramento" }), /anterior à validação final/);
      assert.equal((await db.select().from(accountingTransactions).where(eq(accountingTransactions.id, current.id)))[0].status, "POSTADO");
      const balance = async () => (await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(eq(accountingEntries.accountId, "annual-asset"), eq(accountingTransactions.financialYearId, "next"), eq(accountingTransactions.status, "POSTADO")))).reduce((sum, { entry }) => entry.type === "Débito" ? sum.plus(entry.valueDecimal!) : sum.minus(entry.valueDecimal!), new Decimal(0));
      assert.equal((await balance()).toFixed(2), "37.00");
      const transactionCount = async () => (await db.select({ total: count() }).from(accountingTransactions))[0].total;
      const beforeReplay = await transactionCount();
      const updatedMemory = (await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, updated.editionId)))[0].payload as JsonObject;
      assert.equal((updatedMemory.financialPosition as JsonObject).status, "NOT_RECONCILED");
      assert.equal((await executeAnnualBalanceStage(connection, actor, { ...openingInput, requestKey: "opening-2" })).replay, true);
      assert.equal(await transactionCount(), beforeReplay);
      await assert.rejects(executeAnnualBalanceStage(connection, actor, { ...openingInput, requestKey: "opening-2", reason: "Outra configuração" }), /outra configuração/);
      await db.insert(monthlyAccountingCloses).values({ financialYearId: "next", competence: new Date("2026-01-01"), status: "FECHADO" });
      await assert.rejects(executeAnnualBalanceStage(connection, actor, { ...openingInput, requestKey: "opening-3" }), /competencia contabil nao esta aberta/);
      assert.equal(await transactionCount(), beforeReplay);
      assert.equal((await balance()).toFixed(2), "37.00");
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
