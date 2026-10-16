import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureAccountingPostingRule, createCommitment, createSettlement, createPayment, createRevenue, updatePaymentStatus, reversePayment, cancelSettlement, cancelPayableCarryForward } from "../src/lib/financeiro";
import { transportCarryForward, undoCarryForwardTransport } from "../src/lib/financeiro/carry-forward-transport";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) for (const type of ["PROCESSADO", "NAO_PROCESSADO"] as const) {
  test(`Transporte ${jurisdiction}/${type}: saldo parcial, liquidação herdada, concorrência e desmovimentação`, async context => {
    const f = await createPlanningExecutionFixture(2025, 2, jurisdiction);
    try {
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2025-09-01").getTime() });
      const reservation = await f.reserve("transport-reserve", "3.00");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2025-09-01"), number: "NE-TRANSPORT", value: "3.00", type: "Ordinário", history: "Obrigação inscrita com saldo parcial", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      let settlement = type === "PROCESSADO" ? await createSettlement(f.db, f.actor, { date: new Date("2025-09-02"), value: "3.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" }) : null;
      await f.db.payableCarryForward.create({ data: { id: "parent", financialYearId: "ano", originFinancialYearId: "ano", commitmentId: commitment.id, type, valueDecimal: "3.00", status: "PENDENTE" } });
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Encerrado" } });
      await f.db.financialYear.create({ data: { id: "source-year", year: 2026, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") } });
      if (type === "NAO_PROCESSADO") {
        await configureAccountingPostingRule(f.db, f.actor, { eventCode: "RAP_NAO_PROCESSADO_LIQUIDACAO", eventName: "Liquidação de inscrição não processada", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
        settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-01"), value: "1.50", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", payableCarryForwardId: "parent" });
      }
      assert.ok(settlement);
      const paymentEvent = type === "PROCESSADO" ? "RAP_PROCESSADO_PAGAMENTO" : "RAP_NAO_PROCESSADO_PAGAMENTO";
      await configureAccountingPostingRule(f.db, f.actor, { eventCode: paymentEvent, eventName: "Pagamento da inscrição", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await createRevenue(f.db, f.actor, { date: new Date("2026-09-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "transport-funding" });
      const paymentInput = { date: new Date("2026-09-02"), value: "0.75", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência", payableCarryForwardId: "parent" };
      const originalPayment = await createPayment(f.db, f.actor, { ...paymentInput, orderNumber: "OP-PARENT" });
      await updatePaymentStatus(f.db, f.actor, originalPayment.id, "Paga");
      await f.db.financialYear.create({ data: { id: "target-year", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
      const input = { payableCarryForwardId: "parent", sourceFinancialYearId: "source-year", targetFinancialYearId: "target-year", reason: "Transporte do saldo remanescente após fechamento", requestKey: "transport-1" };
      await assert.rejects(transportCarryForward(f.db, f.actor, input), /origem encerrada/);
      await f.db.financialYear.update({ where: { id: "source-year" }, data: { status: "Encerrado" } });
      await assert.rejects(transportCarryForward(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /UG autorizada/);
      const originalSettlement = JSON.stringify(await f.db.settlement.findUniqueOrThrow({ where: { id: settlement.id } }));
      const concurrent = await Promise.all([transportCarryForward(f.db, f.actor, input), transportCarryForward(f.db, f.actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const transferred = concurrent.find(result => !result.replay)!;
      const child = await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: transferred.payableCarryForwardId } });
      assert.equal(child.valueDecimal.toFixed(2), "2.25");
      assert.equal(child.originFinancialYearId, "ano");
      assert.equal(child.financialYearId, "target-year");
      assert.equal(JSON.stringify(await f.db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })), originalSettlement);
      const link = await f.db.payableCarryForwardSettlementLink.findFirstOrThrow({ where: { payableCarryForwardId: child.id } });
      assert.equal(link.valueDecimal.toFixed(2), type === "PROCESSADO" ? "2.25" : "0.75");
      await assert.rejects(f.db.payableCarryForwardSettlementLink.update({ where: { id: link.id }, data: { valueDecimal: "1.00" } }), /immutable/);
      const availability = async () => (await readResourceAvailability(f.db, f.actor, { financialYearId: "target-year", governmentEntityId: "ente", resourceSourceIds: ["livre"] })).rows[0].carryForwardsPayable;
      assert.equal(await availability(), "2.25");
      await assert.rejects(cancelPayableCarryForward(f.db, f.actor, { payableCarryForwardId: child.id, justification: "Revisão da liquidação herdada" }), /liquidações herdadas/);
      await undoCarryForwardTransport(f.db, f.actor, { payableCarryForwardId: child.id, reason: "Conferência antes de movimentar" });
      assert.equal((await undoCarryForwardTransport(f.db, f.actor, { payableCarryForwardId: child.id, reason: "Conferência antes de movimentar" })).replay, true);
      assert.equal(await availability(), "2.25", "Desmovimentação restaura a obrigação original mesmo preservando a ligação histórica ao sucessor inativo.");
      const repeated = await transportCarryForward(f.db, f.actor, { ...input, requestKey: "transport-2" });
      assert.equal(repeated.payableCarryForwardId, child.id);
      const currentInput = { ...paymentInput, date: new Date("2027-09-01"), payableCarryForwardId: child.id };
      const order = await createPayment(f.db, f.actor, { ...currentInput, orderNumber: "OP-CHILD" });
      await assert.rejects(undoCarryForwardTransport(f.db, f.actor, { payableCarryForwardId: child.id, reason: "Tentativa com ordem emitida" }), /pagamentos/);
      await updatePaymentStatus(f.db, f.actor, order.id, "Paga");
      assert.equal(order.executionFinancialYearId, "target-year");
      assert.equal(await availability(), "1.50");
      if (type === "NAO_PROCESSADO") {
        await assert.rejects(createPayment(f.db, f.actor, { ...currentInput, orderNumber: "OP-INHERITED-EXCESS", value: "0.01" }), /parcela liquidada herdada/);
        const newSettlement = await createSettlement(f.db, f.actor, { date: new Date("2027-09-02"), value: "1.50", commitmentId: commitment.id, payableCarryForwardId: child.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
        await assert.rejects(createSettlement(f.db, f.actor, { date: new Date("2027-09-03"), value: "0.01", commitmentId: commitment.id, payableCarryForwardId: child.id, authorId: "servidora-ana", documentId: "documento-fiscal" }), /excede/);
        context.mock.timers.enable({ apis: ["Date"], now: new Date("2027-09-04").getTime() });
        await cancelSettlement(f.db, f.actor, newSettlement.id);
      } else context.mock.timers.enable({ apis: ["Date"], now: new Date("2027-09-04").getTime() });
      await reversePayment(f.db, f.actor, order.id, "Devolução da parcela no exercício de destino");
      await undoCarryForwardTransport(f.db, f.actor, { payableCarryForwardId: child.id, reason: "Desmovimentação após reversões documentais" });
      assert.equal(await availability(), "2.25");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "source-year" } })).status, "Encerrado");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: originalPayment.id } })).status, "Paga");
      await transportCarryForward(f.db, f.actor, { ...input, requestKey: "transport-3" });
      const secondYearPayment = await createPayment(f.db, f.actor, { ...currentInput, orderNumber: "OP-SECOND-YEAR", value: "0.50" });
      await updatePaymentStatus(f.db, f.actor, secondYearPayment.id, "Paga");
      await f.db.financialYear.update({ where: { id: "target-year" }, data: { status: "Encerrado" } });
      await f.db.financialYear.create({ data: { id: "third-year", year: 2028, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2028-01-01"), endDate: new Date("2028-12-31T23:59:59.999Z") } });
      const third = await transportCarryForward(f.db, f.actor, { payableCarryForwardId: child.id, sourceFinancialYearId: "target-year", targetFinancialYearId: "third-year", reason: "Novo transporte com liquidação herdada da origem", requestKey: "transport-third-year" });
      const thirdChild = await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: third.payableCarryForwardId } });
      assert.equal(thirdChild.valueDecimal.toFixed(2), "1.75");
      const thirdLink = await f.db.payableCarryForwardSettlementLink.findFirstOrThrow({ where: { payableCarryForwardId: thirdChild.id } });
      assert.equal(thirdLink.settlementId, settlement.id);
      assert.equal(thirdLink.valueDecimal.toFixed(2), type === "PROCESSADO" ? "1.75" : "0.25");
      const thirdPayment = await createPayment(f.db, f.actor, { ...paymentInput, orderNumber: "OP-THIRD-YEAR", date: new Date("2028-09-01"), value: "0.25", payableCarryForwardId: thirdChild.id });
      await updatePaymentStatus(f.db, f.actor, thirdPayment.id, "Paga");
      context.mock.timers.reset();
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2028-09-02").getTime() });
      await reversePayment(f.db, f.actor, thirdPayment.id, "Devolução no terceiro exercício");
      await undoCarryForwardTransport(f.db, f.actor, { payableCarryForwardId: thirdChild.id, reason: "Desmovimentação apenas do transporte mais recente" });
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: secondYearPayment.id } })).status, "Paga");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "target-year" } })).status, "Encerrado");
      const thirdAvailability = await readResourceAvailability(f.db, f.actor, { financialYearId: "third-year", governmentEntityId: "ente", resourceSourceIds: ["livre"] });
      assert.equal(thirdAvailability.rows[0].carryForwardsPayable, "1.75");
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
