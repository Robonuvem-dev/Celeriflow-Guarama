import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray } from "drizzle-orm";
import type { JsonObject } from "../src/db/json";
import { accountingEntries, accountingPlans, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { configureAccountingPostingRule, createCommitment, createSettlement, prepareAnnualAccountingClose, finalizeAnnualAccountingClose } from "../src/lib/financeiro";
import { executeAnnualRapPostings } from "../src/lib/financeiro/annual-rap-postings";
import { undoAnnualRapPostingStage } from "../src/lib/financeiro/annual-balance-stages";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Partidas de inscrição RAP ${jurisdiction}: orçamento/DDR, atomicidade, replay e desmovimentação`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("rap-posting", "4.50");
      context.mock.timers.reset();
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number: "NE-INSCRICAO", value: "4.50", type: "Ordinário", history: "Inscrição com execução parcial", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const originTransactions = db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "COMMITMENT"), eq(accountingTransactions.sourceId, commitment.id)));
      await db.update(accountingEntries).set({ classificationSnapshot: { dimensions: { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null } } }).where(inArray(accountingEntries.transactionId, originTransactions));
      await createSettlement(connection, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      await prepareAnnualAccountingClose(connection, actor, "ano");
      const input = { financialYearId: "ano", reason: "Inscrição contábil e DDR do saldo não pago", requestKey: "rap-posting-1" };
      await assert.rejects(executeAnnualRapPostings(connection, f.actor, input), /todas as UGs/);
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /partidas específicas/);
      const transactionCount = async () => (await db.select({ total: count() }).from(accountingTransactions))[0].total;
      const before = await transactionCount();
      await assert.rejects(executeAnnualRapPostings(connection, actor, input), /matriz explícita/);
      assert.equal(await transactionCount(), before);
      await db.insert(accountingPlans).values([{ id: "rap-debit", code: "RAP.DEBIT", name: "Inscrição", type: "Ativo" }, { id: "rap-credit", code: "RAP.CREDIT", name: "Inscrição a pagar", type: "Passivo" }, { id: "ddr-debit", code: "DDR.DEBIT", name: "Disponibilidade comprometida", type: "Ativo" }, { id: "ddr-credit", code: "DDR.CREDIT", name: "Controle da inscrição", type: "Passivo" }]);
      for (const eventCode of ["RAP_PROCESSADO_INSCRICAO", "RAP_NAO_PROCESSADO_INSCRICAO"]) await configureAccountingPostingRule(connection, actor, { eventCode, eventName: "Inscrição composta", debitAccountId: "rap-debit", creditAccountId: "rap-credit", isReference: true, components: [{ debitAccountId: "ddr-debit", creditAccountId: "ddr-credit", valueBasis: "EVENT_VALUE" }] });
      const concurrent = await Promise.all([executeAnnualRapPostings(connection, actor, input), executeAnnualRapPostings(connection, actor, input)]);
      assert.equal(concurrent.filter(row => row.replay).length, 1);
      const edition = concurrent.find(row => !row.replay)!;
      const lines = await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(eq(accountingTransactions.sourceId, edition.editionId)).then(rows => rows.map(row => row.entry));
      assert.equal(lines.length, 8);
      assert.ok(lines.every(row => row.valueDecimal?.eq("2.25") && ((row.classificationSnapshot as JsonObject).dimensions as JsonObject).resourceSourceId === "livre"));
      await assert.rejects(executeAnnualPayableRegistration(connection, actor, { financialYearId: "ano", operation: "UNDO", reason: "Revisão das inscrições", requestKey: "undo-blocked" }), /partidas específicas/);
      await configureAccountingPostingRule(connection, actor, { eventCode: "RAP_PROCESSADO_INSCRICAO", eventName: "Matriz posterior", debitAccountId: "credito", creditAccountId: "debito", isReference: true, components: [] });
      await undoAnnualRapPostingStage(connection, actor, { editionId: edition.editionId, reason: "Revisão independente das partidas" });
      const reversals = await db.select({ entry: accountingEntries }).from(accountingEntries).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(eq(accountingTransactions.eventType, "ANNUAL_RAP_REGISTRATION_UNDONE"), eq(accountingTransactions.sourceId, edition.editionId))).then(rows => rows.map(row => row.entry));
      assert.equal(reversals.length, 8);
      assert.ok(reversals.every(row => ["rap-debit", "rap-credit", "ddr-debit", "ddr-credit"].includes(row.accountId)), "Estorno conserva a composição anterior, independente da nova matriz.");
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /partidas específicas/);
      await executeAnnualPayableRegistration(connection, actor, { financialYearId: "ano", operation: "UNDO", reason: "Desmovimentação separada da inscrição", requestKey: "undo-registrations" });
      await prepareAnnualAccountingClose(connection, actor, "ano");
      const repeated = await executeAnnualRapPostings(connection, actor, { ...input, requestKey: "rap-posting-2" });
      await finalizeAnnualAccountingClose(connection, reviewer, "ano");
      await assert.rejects(undoAnnualRapPostingStage(connection, actor, { editionId: repeated.editionId, reason: "Tentativa após encerramento final" }), /anterior à validação final/);
    } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
  });
}
