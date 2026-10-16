import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureAccountingPostingRule, createCommitment, createSettlement, createPayment, createRevenue, updatePaymentStatus, reversePayment, getBankAccountBalance, cancelPayableCarryForward, accountingPendingChecks } from "../src/lib/financeiro";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`RAP processado ${jurisdiction}: pagamento no ano corrente preserva origem encerrada`, async context => {
    const f = await createPlanningExecutionFixture(2025, 2, jurisdiction);
    try {
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2025-09-01").getTime() });
      const reservation = await f.reserve("rap-reservation", "2.25");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2025-09-01"), number: "NE-RAP", value: "2.25", type: "Ordinário", history: "Obrigação municipal", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const settlement = await createSettlement(f.db, f.actor, { date: new Date("2025-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      await f.db.financialYear.create({ data: { id: "current-year", governmentEntityId: "ente", year: 2026, status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") } });
      await f.db.payableCarryForward.create({ data: { id: "rap", financialYearId: "ano", originFinancialYearId: "ano", commitmentId: commitment.id, type: "PROCESSADO", valueDecimal: "2.25", status: "PENDENTE" } });
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Encerrado" } });
      const date = new Date("2026-09-03");
      await createRevenue(f.db, f.actor, { date, value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "funding" });
      const input = { orderNumber: "OP-RAP", date, value: "2.25", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência", payableCarryForwardId: "rap" };
      await f.db.payableCarryForward.update({ where: { id: "rap" }, data: { type: "NAO_PROCESSADO" } });
      await assert.rejects(createPayment(f.db, f.actor, input), /não processado exige liquidação nativa/);
      await f.db.payableCarryForward.update({ where: { id: "rap" }, data: { type: "PROCESSADO" } });
      await assert.rejects(createPayment(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /gestora|autorizad/i);
      await assert.rejects(createPayment(f.db, f.actor, { ...input, payableCarryForwardId: undefined }), /exercício|exercicio/i);
      const order = await createPayment(f.db, f.actor, input);
      const report = await readResourceAvailability(f.db, f.actor, { financialYearId: "current-year", governmentEntityId: "ente", resourceSourceIds: ["livre"] });
      assert.equal(report.rows[0].commitmentsPayable, "0.00");
      assert.equal(report.rows[0].carryForwardsPayable, "2.25");
      assert.equal(report.rows[0].deficitSurplus, "97.75");
      assert.equal(order.executionFinancialYearId, "current-year");
      assert.equal(order.payableCarryForwardId, "rap");
      assert.equal((await accountingPendingChecks(f.db, "current-year", date)).emittedPayments, 1, "Ordem de RAP pendente bloqueia a competência do exercício de execução");
      assert.equal((await accountingPendingChecks(f.db, "ano", new Date("2025-12-31"))).emittedPayments, 0);
      await assert.rejects(createPayment(f.db, f.actor, { ...input, orderNumber: "OP-EXCESS", value: "0.01" }), /saldo inscrito|liquidado/i);
      await assert.rejects(cancelPayableCarryForward(f.db, f.actor, { payableCarryForwardId: "rap", justification: "Inscrição sob revisão" }), /ordens nativas/);
      await assert.rejects(updatePaymentStatus(f.db, f.actor, order.id, "Paga"), /regra ativa/);
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "100.00");
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: order.id } })).status, "Emitida");
      await configureAccountingPostingRule(f.db, f.actor, { eventCode: "RAP_PROCESSADO_PAGAMENTO", eventName: "Pagamento de RAP processado", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await updatePaymentStatus(f.db, f.actor, order.id, "Paga");
      await updatePaymentStatus(f.db, f.actor, order.id, "Paga");
      const posting = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: order.id } });
      assert.equal(posting.financialYearId, "current-year");
      assert.equal(posting.governmentEntityId, "ente");
      assert.equal(posting.eventType, "RAP_PROCESSADO_PAGAMENTO");
      const movement = await f.db.treasuryMovement.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: order.id } });
      assert.equal(movement.financialYearId, "current-year");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PAGO_RASTREADO");
      assert.equal(await f.db.payableCarryForwardEvent.count({ where: { paymentId: order.id } }), 1);
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "97.75");
      await reversePayment(f.db, f.actor, order.id, "Devolução do pagamento de RAP");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PENDENTE");
      assert.equal(await f.db.payableCarryForwardEvent.count({ where: { paymentId: order.id } }), 2);
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "100.00");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
      const concurrent = await Promise.allSettled([
        createPayment(f.db, f.actor, { ...input, orderNumber: "RAP-CONCURRENT-A", value: "1.50" }),
        createPayment(f.db, f.actor, { ...input, orderNumber: "RAP-CONCURRENT-B", value: "1.50" }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1, "Ordens concorrentes não comprometem acima da inscrição");
      const first = concurrent.find(result => result.status === "fulfilled");
      assert.ok(first && first.status === "fulfilled");
      await updatePaymentStatus(f.db, f.actor, first.value.id, "Paga");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PAGAMENTO_PARCIAL_RASTREADO");
      const remainder = await createPayment(f.db, f.actor, { ...input, orderNumber: "RAP-REMAINDER", value: "0.75" });
      await updatePaymentStatus(f.db, f.actor, remainder.id, "Paga");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PAGO_RASTREADO");
      await reversePayment(f.db, f.actor, first.value.id, "Devolução da primeira parcela");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PAGAMENTO_PARCIAL_RASTREADO");
      await reversePayment(f.db, f.actor, remainder.id, "Devolução da parcela restante");
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "rap" } })).status, "PENDENTE");
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "100.00");
    } finally { await f.close(); }
  });
}
