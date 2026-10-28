import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { financialYears } from "../src/db/schema/finance-years";
import { payableCarryForwardEvents, payableCarryForwards } from "../src/db/schema/finance-payables";
import { payments } from "../src/db/schema/finance-payments";
import { accountingTransactions } from "../src/db/schema/finance-accounting";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { configureAccountingPostingRule, createCommitment, createSettlement, createPayment, createRevenue, updatePaymentStatus, reversePayment, getBankAccountBalance, cancelPayableCarryForward, accountingPendingChecks } from "../src/lib/financeiro";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`RAP processado ${jurisdiction}: pagamento no ano corrente preserva origem encerrada`, async context => {
    const f = await createPlanningExecutionFixture(2025, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const payableStatus = async () => (await db.select({ status: payableCarryForwards.status }).from(payableCarryForwards).where(eq(payableCarryForwards.id, "rap")))[0].status;
      const originStatus = async () => (await db.select({ status: financialYears.status }).from(financialYears).where(eq(financialYears.id, "ano")))[0].status;
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2025-09-01").getTime() });
      const reservation = await f.reserve("rap-reservation", "2.25");
      context.mock.timers.reset();
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2025-09-01"), number: "NE-RAP", value: "2.25", type: "Ordinário", history: "Obrigação municipal", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const settlement = await createSettlement(connection, f.actor, { date: new Date("2025-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      await db.insert(financialYears).values({ id: "current-year", governmentEntityId: "ente", year: 2026, status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") });
      await db.insert(payableCarryForwards).values({ id: "rap", financialYearId: "ano", originFinancialYearId: "ano", commitmentId: commitment.id, type: "PROCESSADO", valueDecimal: new Decimal("2.25"), status: "PENDENTE" });
      await db.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano"));
      const date = new Date("2026-09-03");
      await createRevenue(connection, f.actor, { date, value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "funding" });
      const input = { orderNumber: "OP-RAP", date, value: "2.25", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência", payableCarryForwardId: "rap" };
      await db.update(payableCarryForwards).set({ type: "NAO_PROCESSADO" }).where(eq(payableCarryForwards.id, "rap"));
      await assert.rejects(createPayment(connection, f.actor, input), /não processado exige liquidação nativa/);
      await db.update(payableCarryForwards).set({ type: "PROCESSADO" }).where(eq(payableCarryForwards.id, "rap"));
      await assert.rejects(createPayment(connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /gestora|autorizad/i);
      await assert.rejects(createPayment(connection, f.actor, { ...input, payableCarryForwardId: undefined }), /exercício|exercicio/i);
      const order = await createPayment(connection, f.actor, input);
      const report = await readResourceAvailability(connection, f.actor, { financialYearId: "current-year", governmentEntityId: "ente", resourceSourceIds: ["livre"] });
      assert.equal(report.rows[0].commitmentsPayable, "0.00");
      assert.equal(report.rows[0].carryForwardsPayable, "2.25");
      assert.equal(report.rows[0].deficitSurplus, "97.75");
      assert.equal(order.executionFinancialYearId, "current-year");
      assert.equal(order.payableCarryForwardId, "rap");
      assert.equal((await accountingPendingChecks(db, "current-year", date)).emittedPayments, 1, "Ordem de RAP pendente bloqueia a competência do exercício de execução");
      assert.equal((await accountingPendingChecks(db, "ano", new Date("2025-12-31"))).emittedPayments, 0);
      await assert.rejects(createPayment(connection, f.actor, { ...input, orderNumber: "OP-EXCESS", value: "0.01" }), /saldo inscrito|liquidado/i);
      await assert.rejects(cancelPayableCarryForward(finance.connection, f.actor, { payableCarryForwardId: "rap", justification: "Inscrição sob revisão" }), /ordens nativas/);
      await assert.rejects(updatePaymentStatus(connection, f.actor, order.id, "Paga"), /regra ativa/);
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "100.00");
      assert.equal((await db.select().from(payments).where(eq(payments.id, order.id)))[0].status, "Emitida");
      await configureAccountingPostingRule(connection, f.actor, { eventCode: "RAP_PROCESSADO_PAGAMENTO", eventName: "Pagamento de RAP processado", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await updatePaymentStatus(connection, f.actor, order.id, "Paga");
      await updatePaymentStatus(connection, f.actor, order.id, "Paga");
      const [posting] = await db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "PAYMENT"), eq(accountingTransactions.sourceId, order.id))).limit(1);
      assert.ok(posting);
      assert.equal(posting.financialYearId, "current-year");
      assert.equal(posting.governmentEntityId, "ente");
      assert.equal(posting.eventType, "RAP_PROCESSADO_PAGAMENTO");
      const [movement] = await db.select().from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.sourceType, "PAYMENT"), eq(reconciliationTreasuryMovements.sourceId, order.id))).limit(1);
      assert.ok(movement);
      assert.equal(movement.financialYearId, "current-year");
      assert.equal(await originStatus(), "Encerrado");
      assert.equal(await payableStatus(), "PAGO_RASTREADO");
      assert.equal((await db.select({ total: count() }).from(payableCarryForwardEvents).where(eq(payableCarryForwardEvents.paymentId, order.id)))[0].total, 1);
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "97.75");
      await reversePayment(connection, f.actor, order.id, "Devolução do pagamento de RAP");
      assert.equal(await payableStatus(), "PENDENTE");
      assert.equal((await db.select({ total: count() }).from(payableCarryForwardEvents).where(eq(payableCarryForwardEvents.paymentId, order.id)))[0].total, 2);
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "100.00");
      assert.equal(await originStatus(), "Encerrado");
      const concurrent = await Promise.allSettled([
        createPayment(connection, f.actor, { ...input, orderNumber: "RAP-CONCURRENT-A", value: "1.50" }),
        createPayment(connection, f.actor, { ...input, orderNumber: "RAP-CONCURRENT-B", value: "1.50" }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1, "Ordens concorrentes não comprometem acima da inscrição");
      const first = concurrent.find(result => result.status === "fulfilled");
      assert.ok(first && first.status === "fulfilled");
      await updatePaymentStatus(connection, f.actor, first.value.id, "Paga");
      assert.equal(await payableStatus(), "PAGAMENTO_PARCIAL_RASTREADO");
      const remainder = await createPayment(connection, f.actor, { ...input, orderNumber: "RAP-REMAINDER", value: "0.75" });
      await updatePaymentStatus(connection, f.actor, remainder.id, "Paga");
      assert.equal(await payableStatus(), "PAGO_RASTREADO");
      await reversePayment(connection, f.actor, first.value.id, "Devolução da primeira parcela");
      assert.equal(await payableStatus(), "PAGAMENTO_PARCIAL_RASTREADO");
      await reversePayment(connection, f.actor, remainder.id, "Devolução da parcela restante");
      assert.equal(await payableStatus(), "PENDENTE");
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "100.00");
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
