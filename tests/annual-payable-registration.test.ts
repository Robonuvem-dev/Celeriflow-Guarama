import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { accountingEntries, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { payableCarryForwardEvents, payableCarryForwards } from "../src/db/schema/finance-payables";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";
import { configureAccountingPostingRule, createCommitment, createSettlement, createCommitmentMovement, prepareAnnualAccountingClose, finalizeAnnualAccountingClose, setFinancialYearStatus, requestAccountingMonthReopen, authorizeAccountingMonthReopen, requestAccountingMonthClose, authorizeAccountingMonthClose, reregisterPayableCarryForward } from "../src/lib/financeiro";
import { executeAnnualRapPostings } from "../src/lib/financeiro/annual-rap-postings";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Inscrição anual ${jurisdiction}: concorrência, tipos, desmovimentação e reapuração de saldo zero`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await setFinancialYearStatus(connection, actor, "ano", "Aberto");
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("annual-rap-reserve", "4.50");
      context.mock.timers.reset();
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number: "ANNUAL-RAP", value: "4.50", type: "Estimativo", history: "Despesa com saldo a inscrever", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const originTransactions = db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "COMMITMENT"), eq(accountingTransactions.sourceId, commitment.id)));
      await db.update(accountingEntries).set({ classificationSnapshot: { dimensions: { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null } } }).where(inArray(accountingEntries.transactionId, originTransactions));
      await createSettlement(connection, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      const input = { financialYearId: "ano", operation: "REGISTER" as const, reason: "Apuração individual no encerramento", requestKey: "register-1" };
      await assert.rejects(executeAnnualPayableRegistration(connection, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualPayableRegistration(connection, actor, input), /doze competências/);
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      const concurrent = await Promise.all([executeAnnualPayableRegistration(connection, actor, input), executeAnnualPayableRegistration(connection, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const inscriptions = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.commitmentId, commitment.id)).orderBy(asc(payableCarryForwards.type));
      assert.equal(inscriptions.length, 2);
      assert.deepEqual(inscriptions.map(row => [row.type, row.valueDecimal.toFixed(2)]), [["NAO_PROCESSADO", "2.25"], ["PROCESSADO", "2.25"]]);
      const originalIds = inscriptions.map(row => row.id).sort();
      await prepareAnnualAccountingClose(connection, actor, "ano");
      const undo = { ...input, operation: "UNDO" as const, reason: "Revisão independente da inscrição", requestKey: "undo-1" };
      await executeAnnualPayableRegistration(connection, actor, undo);
      assert.equal((await executeAnnualPayableRegistration(connection, actor, undo)).replay, true);
      assert.equal((await db.select({ total: count() }).from(payableCarryForwards).where(eq(payableCarryForwards.status, "INSCRICAO_DESMOVIMENTADA")))[0].total, 2);
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /Prepare o encerramento/);
      await executeAnnualPayableRegistration(connection, actor, { ...input, requestKey: "register-2" });
      assert.deepEqual((await db.select({ id: payableCarryForwards.id }).from(payableCarryForwards)).map(row => row.id).sort(), originalIds);
      await setFinancialYearStatus(connection, actor, "ano", "Aberto");
      const september = new Date("2026-09-01");
      await requestAccountingMonthReopen(connection, actor, "ano", september, "Correção documental do saldo não liquidado.");
      await authorizeAccountingMonthReopen(connection, reviewer, "ano", september);
      await createCommitmentMovement(connection, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-05"), type: "Anulação", value: "2.25", justification: "Anulação nativa do saldo estimativo não liquidado" });
      await requestAccountingMonthClose(connection, actor, "ano", september);
      await authorizeAccountingMonthClose(connection, reviewer, "ano", september);
      await executeAnnualPayableRegistration(connection, actor, { ...input, requestKey: "register-3" });
      const [unprocessed] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, inscriptions[0].id));
      assert.ok(unprocessed);
      assert.equal(unprocessed.status, "INSCRICAO_DESMOVIMENTADA");
      assert.equal(unprocessed.valueDecimal.toFixed(2), "2.25", "A desmovimentação preserva o valor histórico da inscrição.");
      await prepareAnnualAccountingClose(connection, actor, "ano");
      await assert.rejects(finalizeAnnualAccountingClose(connection, reviewer, "ano"), /partidas específicas/);
      await configureAccountingPostingRule(connection, actor, { eventCode: "RAP_PROCESSADO_INSCRICAO", eventName: "Inscrição processada", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await executeAnnualRapPostings(connection, actor, { financialYearId: "ano", reason: "Publicação específica da inscrição processada", requestKey: "processed-posting" });
      await finalizeAnnualAccountingClose(connection, reviewer, "ano");
      await assert.rejects(executeAnnualPayableRegistration(connection, actor, { ...undo, requestKey: "undo-after-final" }), /anterior à validação final/);
      assert.equal((await db.select({ total: count() }).from(payableCarryForwards))[0].total, 2);
    } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
  });

  test(`Inscrição anual ${jurisdiction}: transporte posterior impede desmovimentação com rollback`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await setFinancialYearStatus(connection, actor, "ano", "Aberto");
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("annual-guard-reserve", "2.25");
      context.mock.timers.reset();
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number: "ANNUAL-GUARD", value: "2.25", type: "Ordinário", history: "Obrigação com etapa posterior", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      const input = { financialYearId: "ano", operation: "REGISTER" as const, reason: "Inscrição anual", requestKey: "guard-register" };
      await executeAnnualPayableRegistration(connection, actor, input);
      await db.insert(financialYears).values({ id: "next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") });
      const [source] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.commitmentId, commitment.id)).limit(1);
      assert.ok(source);
      await reregisterPayableCarryForward(finance.connection, f.actor, { payableCarryForwardId: source.id, targetFinancialYearId: "next", justification: "Reinscrição documental posterior" });
      const eventCount = async () => (await db.select({ total: count() }).from(payableCarryForwardEvents))[0].total;
      const before = await eventCount();
      await assert.rejects(executeAnnualPayableRegistration(connection, actor, { ...input, operation: "UNDO", requestKey: "guard-undo" }), /transporte posterior/);
      assert.equal(await eventCount(), before);
      assert.equal((await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, source.id)))[0].status, "REINSCRITO");
      await assert.rejects(executeAnnualPayableRegistration(connection, actor, { ...input, reason: "Chave reutilizada" }), /outros dados/);
    } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
  });
}
