import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createCommitment, createSettlement, createPayment, createRevenue, configureAccountingPostingRule, requestAccountingMonthClose, authorizeAccountingMonthClose, prepareAnnualAccountingClose, finalizeAnnualAccountingClose, accountingPendingChecks } from "../src/lib/financeiro";
import { prepareAnnualPaymentPrograms, transportAnnualPaymentPrograms, undoAnnualPaymentPrograms } from "../src/lib/financeiro/annual-payment-program-transport";
import { executeAnnualRapPostings } from "../src/lib/financeiro/annual-rap-postings";
import { applyPaymentBankReturn } from "../src/lib/financeiro/payment-bank-return";
import { undoCarryForwardTransport } from "../src/lib/financeiro/carry-forward-transport";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Programações ${jurisdiction}: ordem não preparada bloqueia fechamento e lote incompleto reverte toda a baixa`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("program-batch", "3.00");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "NE-PROGRAM-BATCH", value: "3.00", type: "Ordinário", history: "Lote de ordens em aberto", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "3.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      await createRevenue(f.db, f.actor, { date: new Date("2026-09-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "batch-funding" });
      const orders = [];
      for (const orderNumber of ["OP-BATCH-1", "OP-BATCH-2"]) orders.push(await createPayment(f.db, f.actor, { orderNumber, date: new Date("2026-09-03"), value: "1.50", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" }));
      await f.db.financialYear.create({ data: { id: "batch-next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
      const input = { sourceFinancialYearId: "ano", targetFinancialYearId: "batch-next", paymentIds: [orders[0].id], reason: "Programação em aberto", requestKey: "batch-partial" };
      await prepareAnnualPaymentPrograms(f.db, actor, input);
      assert.equal((await accountingPendingChecks(f.db, "ano", new Date("2026-12-01"))).emittedPayments, 1);
      await assert.rejects(requestAccountingMonthClose(f.db, actor, "ano", new Date("2026-12-01")), /pendencias/);
      await prepareAnnualPaymentPrograms(f.db, actor, { ...input, paymentIds: orders.map(row => row.id), requestKey: "batch-all-prepared" });
      assert.equal((await accountingPendingChecks(f.db, "ano", new Date("2026-12-01"))).emittedPayments, 0);
      await f.db.payment.update({ where: { id: orders[1].id }, data: { netValueDecimal: "1.40" } });
      assert.equal((await accountingPendingChecks(f.db, "ano", new Date("2026-12-01"))).emittedPayments, 1, "Alterar o valor invalida a dispensa documental.");
      await f.db.payment.update({ where: { id: orders[1].id }, data: { netValueDecimal: "1.50" } });
      await f.db.payableCarryForward.create({ data: { id: "batch-parent", financialYearId: "ano", originFinancialYearId: "ano", commitmentId: commitment.id, type: "PROCESSADO", valueDecimal: "3.00", status: "PENDENTE" } });
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Encerrado" } });
      const before = await f.db.payment.count();
      await assert.rejects(transportAnnualPaymentPrograms(f.db, actor, input), /ordem pendente/);
      assert.equal(await f.db.payment.count(), before);
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: orders[0].id } })).status, "Emitida");
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: orders[0].id } })).paymentOrderExternalId, orders[0].paymentOrderExternalId);
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "batch-parent" } })).status, "PENDENTE");
      const stage = await transportAnnualPaymentPrograms(f.db, actor, { ...input, paymentIds: orders.map(row => row.id), requestKey: "batch-all" });
      assert.equal(await f.db.payment.count({ where: { executionFinancialYearId: "batch-next", status: "Emitida" } }), 2);
      await undoAnnualPaymentPrograms(f.db, actor, { stageId: stage.stageId, reason: "Desmovimentar programações em aberto" });
      const child = await f.db.payableCarryForward.findUniqueOrThrow({ where: { previousPayableCarryForwardId: "batch-parent" } });
      await undoCarryForwardTransport(f.db, actor, { payableCarryForwardId: child.id, reason: "Desmovimentação independente da inscrição transportada" });
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: "batch-parent" } })).status, "PENDENTE");
    } finally { context.mock.timers.reset(); await f.close(); }
  });
  test(`Programações ${jurisdiction}: baixa/cópia, retenções, retorno correlacionado e desmovimentação`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("program-reserve", "3.00");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "NE-PROGRAM", value: "3.00", type: "Ordinário", history: "Programação a transportar", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await f.db.accountingEntry.updateMany({ where: { transaction: { sourceType: "COMMITMENT", sourceId: commitment.id } }, data: { classificationSnapshot: { dimensions: { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null } } } });
      await f.db.retentionRule.create({ data: { id: "program-retention", code: "IRRF-PROGRAM", type: "IRRF", description: "Retenção", beneficiaryName: "Ente", calculationBasePercentage: 100, ratePercentage: 20, financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true } });
      const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "3.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["program-retention"] });
      await createRevenue(f.db, f.actor, { date: new Date("2026-09-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "program-funding" });
      await f.db.bankAccount.update({ where: { id: "banco" }, data: { externalId: "bank-program" } });
      const payment = await createPayment(f.db, f.actor, { orderNumber: "OP-PROGRAM", date: new Date("2026-09-03"), value: "3.00", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
      await f.db.payment.update({ where: { id: payment.id }, data: { bankStatus: "RECEIVED", bankSubmittedAt: new Date("2026-09-03") } });
      await f.db.payableCarryForward.create({ data: { id: "program-parent", financialYearId: "ano", originFinancialYearId: "ano", commitmentId: commitment.id, type: "PROCESSADO", valueDecimal: "3.00", status: "PENDENTE" } });
      await f.db.financialYear.create({ data: { id: "program-next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
      const input = { sourceFinancialYearId: "ano", targetFinancialYearId: "program-next", paymentIds: [payment.id], reason: "Transporte de programação aguardando banco", requestKey: "program-1" };
      await assert.rejects(transportAnnualPaymentPrograms(f.db, f.actor, input), /autorização integral/);
      await assert.rejects(transportAnnualPaymentPrograms(f.db, actor, input), /origem encerrada/);
      await assert.rejects(requestAccountingMonthClose(f.db, actor, "ano", new Date("2026-09-01")), /pendencias/);
      await prepareAnnualPaymentPrograms(f.db, actor, input);
      assert.equal((await prepareAnnualPaymentPrograms(f.db, actor, input)).replay, true);
      for (let month = 0; month < 12; month++) {
        const competence = new Date(Date.UTC(2026, month, 1));
        await requestAccountingMonthClose(f.db, actor, "ano", competence);
        await authorizeAccountingMonthClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano", competence);
      }
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      await configureAccountingPostingRule(f.db, actor, { eventCode: "RAP_PROCESSADO_INSCRICAO", eventName: "Inscrição processada", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await executeAnnualRapPostings(f.db, actor, { financialYearId: "ano", reason: "Inscrição da despesa programada e não paga", requestKey: "program-registration" });
      await finalizeAnnualAccountingClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano");
      const cashCount = await f.db.treasuryMovement.count();
      const concurrent = await Promise.all([transportAnnualPaymentPrograms(f.db, actor, input), transportAnnualPaymentPrograms(f.db, actor, input)]);
      assert.equal(concurrent.filter(row => row.replay).length, 1);
      const stage = concurrent.find(row => !row.replay)!;
      const copy = await f.db.payment.findUniqueOrThrow({ where: { paymentOrderExternalId: payment.paymentOrderExternalId! }, include: { retentions: { include: { withholdingPayable: true } } } });
      assert.notEqual(copy.id, payment.id);
      assert.equal(copy.executionFinancialYearId, "program-next");
      assert.equal(copy.netValueDecimal!.toFixed(2), "2.40");
      assert.equal(copy.bankStatus, "RECEIVED");
      assert.equal(copy.integrationEventId, payment.integrationEventId);
      assert.equal(copy.retentions[0].valueDecimal.toFixed(2), "0.60");
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "Transportada");
      assert.equal(await f.db.treasuryMovement.count(), cashCount);
      await assert.rejects(undoCarryForwardTransport(f.db, actor, { payableCarryForwardId: copy.payableCarryForwardId!, reason: "Tentativa antes de desmovimentar a programação" }), /pagamentos/);
      await undoAnnualPaymentPrograms(f.db, actor, { stageId: stage.stageId, reason: "Conferência da cópia antes do retorno" });
      assert.equal((await undoAnnualPaymentPrograms(f.db, actor, { stageId: stage.stageId, reason: "Conferência" })).replay, true);
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { paymentOrderExternalId: payment.paymentOrderExternalId! } })).id, payment.id);
      const nextStage = await transportAnnualPaymentPrograms(f.db, actor, { ...input, requestKey: "program-2" });
      const active = await f.db.payment.findUniqueOrThrow({ where: { paymentOrderExternalId: payment.paymentOrderExternalId! } });
      await configureAccountingPostingRule(f.db, actor, { eventCode: "RAP_PROCESSADO_PAGAMENTO", eventName: "Pagamento processado", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      const payload = { payment_order_external_id: payment.paymentOrderExternalId!, integration_event_id: payment.integrationEventId!, bank_account_external_id: "bank-program", amount: "2.40", status: "SETTLED", bank_transaction_id: "program-debit", processed_at: "2027-09-01T12:00:00Z" };
      await assert.rejects(applyPaymentBankReturn(f.db, actor, { ...payload, processed_at: "2026-12-31T12:00:00Z" }), /exercício de destino/);
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: active.id } })).status, "Emitida");
      const returns = await Promise.all([applyPaymentBankReturn(f.db, actor, payload), applyPaymentBankReturn(f.db, actor, payload)]);
      assert.equal(returns.filter(row => row.replay).length, 1);
      assert.ok(returns.every(row => row.paymentId === active.id));
      assert.equal(await f.db.treasuryMovement.count({ where: { sourceType: "PAYMENT", sourceId: active.id } }), 1);
      assert.equal((await f.db.treasuryMovement.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: active.id } })).date.toISOString(), payload.processed_at.replace("Z", ".000Z"));
      await assert.rejects(undoAnnualPaymentPrograms(f.db, actor, { stageId: nextStage.stageId, reason: "Tentativa após retorno bancário" }), /retorno bancário/);
      await assert.rejects(applyPaymentBankReturn(f.db, actor, { ...payload, bank_transaction_id: "other-debit" }), /outra transação/);
      await assert.rejects(applyPaymentBankReturn(f.db, actor, { ...payload, status: "PENDING" }), /já executada/);
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
