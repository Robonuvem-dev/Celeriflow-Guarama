import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureAccountingPostingRule, createCommitment, createCommitmentMovement, createSettlement, setFinancialYearStatus } from "../src/lib/financeiro";
import { executeAnnualEstimativeBalances } from "../src/lib/financeiro/annual-estimative-balances";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  for (const operation of ["KEEP", "CANCEL_UNSETTLED"] as const) {
    test(`Estimativos ${jurisdiction}/${operation}: opção anual, composição nativa, replay e inscrição`, async context => {
      const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
      try {
        const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
        await setFinancialYearStatus(f.db, actor, "ano", "Aberto");
        await f.db.accountingPlan.createMany({ data: [{ id: "available-control", code: "CONTROL.AVAILABLE", name: "Disponibilidade", type: "Controle" }, { id: "committed-control", code: "CONTROL.COMMITTED", name: "Comprometimento", type: "Controle" }] });
        await configureAccountingPostingRule(f.db, actor, { eventCode: "EMPENHO_EMITIDO", eventName: "Empenho composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components: [{ debitAccountId: "available-control", creditAccountId: "committed-control", valueBasis: "EVENT_VALUE" }] });
        const commit = async (number: string, type: string, value: string) => {
          context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
          const reservation = await f.reserve(number, value);
          context.mock.timers.reset();
          return createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number, type, value, history: "Despesa com saldo de encerramento", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
        };
        const estimate = await commit("EST-PARCIAL", "Estimativo", "4.50");
        const ordinary = await commit("ORD-PRESERVADO", "Ordinário", "1.50");
        await createCommitmentMovement(f.db, f.actor, { commitmentId: estimate.id, date: new Date("2026-09-02"), type: "Reforço", value: "0.75", justification: "Complementação fundamentada" });
        await createCommitmentMovement(f.db, f.actor, { commitmentId: estimate.id, date: new Date("2026-09-03"), type: "Anulação", value: "0.25", justification: "Ajuste do saldo" });
        const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-04"), value: "2.25", commitmentId: estimate.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
        const input = { financialYearId: "ano", operation, reason: "Opção de encerramento dos empenhos estimativos", requestKey: "annual-estimate-1" };
        await assert.rejects(executeAnnualEstimativeBalances(f.db, f.actor, input), /todas as UGs/);
        await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-12-01"), status: "FECHADO" } });
        await assert.rejects(executeAnnualEstimativeBalances(f.db, actor, input), /competencia contabil/);
        await f.db.monthlyAccountingClose.updateMany({ data: { status: "ABERTO" } });
        const concurrent = await Promise.all([executeAnnualEstimativeBalances(f.db, actor, input), executeAnnualEstimativeBalances(f.db, actor, input)]);
        assert.equal(concurrent.filter(result => result.replay).length, 1);
        await assert.rejects(executeAnnualEstimativeBalances(f.db, actor, { ...input, reason: "Outra decisão" }), /outros dados/);
        const movements = await f.db.commitmentMovement.findMany({ where: { commitmentId: estimate.id, date: { gte: new Date("2026-12-01") } } });
        assert.equal(movements.length, operation === "KEEP" ? 0 : 1);
        if (operation === "CANCEL_UNSETTLED") {
          assert.equal(movements[0].valueDecimal?.toFixed(2), "2.75");
          const posting = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceId: movements[0].id }, include: { entries: true } });
          assert.equal(posting.entries.length, 4);
          assert.ok(posting.entries.every(entry => entry.valueDecimal?.eq("2.75")));
          assert.equal(posting.budgetUnitId, "ug");
        }
        assert.equal((await f.db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })).valueDecimal?.toFixed(2), "2.25");
        assert.equal(await f.db.commitmentMovement.count({ where: { commitmentId: ordinary.id } }), 0);
        await executeAnnualEstimativeBalances(f.db, actor, { ...input, requestKey: "annual-estimate-2" });
        assert.equal(await f.db.commitmentMovement.count({ where: { commitmentId: estimate.id } }), operation === "KEEP" ? 2 : 3, "Nova etapa não anula o mesmo saldo duas vezes.");
        await f.db.monthlyAccountingClose.deleteMany();
        await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
        await executeAnnualPayableRegistration(f.db, actor, { financialYearId: "ano", operation: "REGISTER", reason: "Inscrição após opção estimativa", requestKey: "register-after-estimate" });
        const payables = await f.db.payableCarryForward.findMany({ where: { commitmentId: estimate.id }, orderBy: { type: "asc" } });
        assert.deepEqual(payables.map(row => [row.type, row.valueDecimal.toFixed(2)]), operation === "KEEP" ? [["NAO_PROCESSADO", "2.75"], ["PROCESSADO", "2.25"]] : [["PROCESSADO", "2.25"]]);
        assert.equal((await f.db.payableCarryForward.findFirstOrThrow({ where: { commitmentId: ordinary.id } })).valueDecimal.toFixed(2), "1.50");
      } finally { context.mock.timers.reset(); await f.close(); }
    });
  }

  test(`Estimativos ${jurisdiction}: falha no segundo empenho reverte lote, orçamento e auditoria`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await setFinancialYearStatus(f.db, actor, "ano", "Aberto");
      for (const number of ["EST-A", "EST-B"]) {
        context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
        const reservation = await f.reserve(number, "1.50");
        context.mock.timers.reset();
        await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number, type: "Estimativo", value: "1.50", history: "Despesa estimada", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      }
      const commitments = await f.db.commitment.findMany({ orderBy: { id: "asc" } });
      await f.db.accountingTransaction.updateMany({ where: { sourceType: "COMMITMENT", sourceId: commitments[1].id }, data: { status: "RASCUNHO" } });
      const before = JSON.stringify({ appropriation: await f.db.budgetAppropriation.findUnique({ where: { id: f.appropriationId } }), audits: await f.db.financialAuditLog.count(), transactions: await f.db.accountingTransaction.count(), planningEvents: await f.db.planningQuotaEvent.count() });
      await assert.rejects(executeAnnualEstimativeBalances(f.db, actor, { financialYearId: "ano", operation: "CANCEL_UNSETTLED", reason: "Anulação integral dos saldos estimativos", requestKey: "rollback-estimates" }), /postagem original/);
      assert.equal(await f.db.commitmentMovement.count(), 0);
      const after = JSON.stringify({ appropriation: await f.db.budgetAppropriation.findUnique({ where: { id: f.appropriationId } }), audits: await f.db.financialAuditLog.count(), transactions: await f.db.accountingTransaction.count(), planningEvents: await f.db.planningQuotaEvent.count() });
      assert.equal(after, before);
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
