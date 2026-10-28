import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { accountingEntries, accountingPlans, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { budgetAppropriations, commitmentMovements, commitments } from "../src/db/schema/finance-budget";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { payableCarryForwards } from "../src/db/schema/finance-payables";
import { settlements } from "../src/db/schema/finance-settlements";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { configureAccountingPostingRule, createCommitment, createCommitmentMovement, createSettlement, setFinancialYearStatus } from "../src/lib/financeiro";
import { executeAnnualEstimativeBalances } from "../src/lib/financeiro/annual-estimative-balances";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  for (const operation of ["KEEP", "CANCEL_UNSETTLED"] as const) {
    test(`Estimativos ${jurisdiction}/${operation}: opção anual, composição nativa, replay e inscrição`, async context => {
      const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
      let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
      try {
        finance = await connectFinanceDrizzleFixture(f.pg);
        const { connection } = finance;
        const db = connection.db;
        const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
        await setFinancialYearStatus(connection, actor, "ano", "Aberto");
        await db.insert(accountingPlans).values([{ id: "available-control", code: "CONTROL.AVAILABLE", name: "Disponibilidade", type: "Controle" }, { id: "committed-control", code: "CONTROL.COMMITTED", name: "Comprometimento", type: "Controle" }]);
        await configureAccountingPostingRule(connection, actor, { eventCode: "EMPENHO_EMITIDO", eventName: "Empenho composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components: [{ debitAccountId: "available-control", creditAccountId: "committed-control", valueBasis: "EVENT_VALUE" }] });
        const commit = async (number: string, type: string, value: string) => {
          context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
          const reservation = await f.reserve(number, value);
          context.mock.timers.reset();
          return createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number, type, value, history: "Despesa com saldo de encerramento", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
        };
        const estimate = await commit("EST-PARCIAL", "Estimativo", "4.50");
        const ordinary = await commit("ORD-PRESERVADO", "Ordinário", "1.50");
        await createCommitmentMovement(connection, f.actor, { commitmentId: estimate.id, date: new Date("2026-09-02"), type: "Reforço", value: "0.75", justification: "Complementação fundamentada" });
        await createCommitmentMovement(connection, f.actor, { commitmentId: estimate.id, date: new Date("2026-09-03"), type: "Anulação", value: "0.25", justification: "Ajuste do saldo" });
        const settlement = await createSettlement(connection, f.actor, { date: new Date("2026-09-04"), value: "2.25", commitmentId: estimate.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
        const input = { financialYearId: "ano", operation, reason: "Opção de encerramento dos empenhos estimativos", requestKey: "annual-estimate-1" };
        await assert.rejects(executeAnnualEstimativeBalances(connection, f.actor, input), /todas as UGs/);
        await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-12-01"), status: "FECHADO" });
        await assert.rejects(executeAnnualEstimativeBalances(connection, actor, input), /competencia contabil/);
        await db.update(monthlyAccountingCloses).set({ status: "ABERTO" });
        const concurrent = await Promise.all([executeAnnualEstimativeBalances(connection, actor, input), executeAnnualEstimativeBalances(connection, actor, input)]);
        assert.equal(concurrent.filter(result => result.replay).length, 1);
        await assert.rejects(executeAnnualEstimativeBalances(connection, actor, { ...input, reason: "Outra decisão" }), /outros dados/);
        const movements = await db.select().from(commitmentMovements).where(and(eq(commitmentMovements.commitmentId, estimate.id), gte(commitmentMovements.date, new Date("2026-12-01"))));
        assert.equal(movements.length, operation === "KEEP" ? 0 : 1);
        if (operation === "CANCEL_UNSETTLED") {
          assert.equal(movements[0].valueDecimal?.toFixed(2), "2.75");
          const [posting] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.sourceId, movements[0].id)).limit(1);
          assert.ok(posting);
          const entries = await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posting.id));
          assert.equal(entries.length, 4);
          assert.ok(entries.every(entry => entry.valueDecimal?.eq("2.75")));
          assert.equal(posting.budgetUnitId, "ug");
        }
        assert.equal((await db.select().from(settlements).where(eq(settlements.id, settlement.id)))[0].valueDecimal?.toFixed(2), "2.25");
        assert.equal((await db.select({ total: count() }).from(commitmentMovements).where(eq(commitmentMovements.commitmentId, ordinary.id)))[0].total, 0);
        await executeAnnualEstimativeBalances(connection, actor, { ...input, requestKey: "annual-estimate-2" });
        assert.equal((await db.select({ total: count() }).from(commitmentMovements).where(eq(commitmentMovements.commitmentId, estimate.id)))[0].total, operation === "KEEP" ? 2 : 3, "Nova etapa não anula o mesmo saldo duas vezes.");
        await db.delete(monthlyAccountingCloses);
        await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
        await executeAnnualPayableRegistration(connection, actor, { financialYearId: "ano", operation: "REGISTER", reason: "Inscrição após opção estimativa", requestKey: "register-after-estimate" });
        const payables = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.commitmentId, estimate.id)).orderBy(asc(payableCarryForwards.type));
        assert.deepEqual(payables.map(row => [row.type, row.valueDecimal.toFixed(2)]), operation === "KEEP" ? [["NAO_PROCESSADO", "2.75"], ["PROCESSADO", "2.25"]] : [["PROCESSADO", "2.25"]]);
        assert.equal((await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.commitmentId, ordinary.id)).limit(1))[0].valueDecimal.toFixed(2), "1.50");
      } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
    });
  }

  test(`Estimativos ${jurisdiction}: falha no segundo empenho reverte lote, orçamento e auditoria`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await setFinancialYearStatus(connection, actor, "ano", "Aberto");
      for (const number of ["EST-A", "EST-B"]) {
        context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
        const reservation = await f.reserve(number, "1.50");
        context.mock.timers.reset();
        await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number, type: "Estimativo", value: "1.50", history: "Despesa estimada", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      }
      const orderedCommitments = await db.select().from(commitments).orderBy(asc(commitments.id));
      await db.update(accountingTransactions).set({ status: "RASCUNHO" }).where(and(eq(accountingTransactions.sourceType, "COMMITMENT"), eq(accountingTransactions.sourceId, orderedCommitments[1].id)));
      const snapshot = async () => JSON.stringify({ appropriation: (await db.select().from(budgetAppropriations).where(eq(budgetAppropriations.id, f.appropriationId)))[0] ?? null, audits: (await db.select({ total: count() }).from(financialAuditLogs))[0].total, transactions: (await db.select({ total: count() }).from(accountingTransactions))[0].total, planningEvents: (await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "PlanningQuotaEvent"`)).rows[0].total });
      const before = await snapshot();
      await assert.rejects(executeAnnualEstimativeBalances(connection, actor, { financialYearId: "ano", operation: "CANCEL_UNSETTLED", reason: "Anulação integral dos saldos estimativos", requestKey: "rollback-estimates" }), /postagem original/);
      assert.equal((await db.select({ total: count() }).from(commitmentMovements))[0].total, 0);
      const after = await snapshot();
      assert.equal(after, before);
    } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
  });
}
