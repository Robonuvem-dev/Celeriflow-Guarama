import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureAccountingPostingRule, createCommitment, createCommitmentMovement, cancelCommitment, createSettlement, cancelSettlement, createPayment, createRevenue, updatePaymentStatus, reversePayment, getBankAccountBalance, postAccountingEvent } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Composição ${jurisdiction}: orçamento, passivo, banco e retenções são atômicos e estornáveis`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      await f.db.accountingPlan.createMany({ data: [
        { id: "cash", code: "ISOLATED.CASH", name: "Banco", type: "Ativo" },
        { id: "liability", code: "ISOLATED.LIABILITY", name: "Fornecedor", type: "Passivo" },
        { id: "withholding", code: "ISOLATED.WITHHOLDING", name: "Retenções", type: "Passivo" },
        { id: "control-available", code: "ISOLATED.CONTROL_AVAILABLE", name: "Recursos disponíveis", type: "Controle" },
        { id: "control-committed", code: "ISOLATED.CONTROL_COMMITTED", name: "Recursos comprometidos", type: "Controle" },
      ] });
      await f.db.bankAccount.update({ where: { id: "banco" }, data: { accountingPlanId: "cash" } });
      const components = [
        { debitAccountId: "liability", creditAccountId: "cash", valueBasis: "PAYMENT_NET" as const, creditFromOriginBank: true },
        { debitAccountId: "liability", creditAccountId: "withholding", valueBasis: "PAYMENT_RETENTION" as const },
      ];
      const configuration = { eventCode: "PAGAMENTO_EFETIVADO", eventName: "Pagamento composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components };
      const rule = await configureAccountingPostingRule(f.db, f.actor, configuration);
      await assert.rejects(configureAccountingPostingRule(f.db, f.actor, { ...configuration, components: [components[0], components[0]] }), /repetir o mesmo par/);
      await configureAccountingPostingRule(f.db, f.actor, { ...configuration, components: undefined });
      assert.equal(await f.db.accountingPostingComponent.count({ where: { ruleId: rule.id } }), 2, "Editor legado preserva componentes existentes");
      await assert.rejects(configureAccountingPostingRule(f.db, f.actor, { ...configuration, components: [{ ...components[0], debitAccountId: "missing" }] }), /nao foram encontradas/);
      assert.equal(await f.db.accountingPostingComponent.count({ where: { ruleId: rule.id } }), 2);
      await configureAccountingPostingRule(f.db, f.actor, { eventCode: "EMPENHO_EMITIDO", eventName: "Empenho composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components: [{ debitAccountId: "control-available", creditAccountId: "control-committed", valueBasis: "EVENT_VALUE" }] });
      await createRevenue(f.db, f.actor, { date: new Date("2026-09-01"), value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "funding" });
      const reservation = await f.reserve("compound-reserve", "2.25");
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "NE-COMP", value: "2.25", type: "Ordinário", history: "Serviço municipal", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const commitmentPosting = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "COMMITMENT", sourceId: commitment.id }, include: { entries: true } });
      assert.equal(commitmentPosting.entries.length, 4);
      for (const type of ["Reforço", "Anulação"] as const) await createCommitmentMovement(f.db, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-01"), type, value: "0.25", justification: "Ajuste fundamentado do saldo" });
      await f.db.retentionRule.create({ data: { id: "retention", code: "IRRF-COMP", type: "IRRF", description: "Retenção municipal de ensaio", beneficiaryName: "Ente municipal", calculationBasePercentage: 100, ratePercentage: 20, financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true } });
      const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["retention"] });
      const date = new Date("2026-09-03");
      const payment = await createPayment(f.db, f.actor, { orderNumber: "OP-COMP", date, value: "2.25", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
      await f.db.accountingPlan.create({ data: { id: "withholding-child", code: "ISOLATED.WITHHOLDING.CHILD", name: "Desdobramento da retenção", type: "Passivo" } });
      await assert.rejects(updatePaymentStatus(f.db, f.actor, payment.id, "Paga"), /conta analítica de último nível/);
      assert.equal((await f.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "Emitida");
      assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "PAYMENT", sourceId: payment.id } }), 0);
      assert.equal(await f.db.treasuryMovement.count({ where: { sourceType: "PAYMENT", sourceId: payment.id } }), 0);
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "100.00");
      await f.db.accountingPlan.delete({ where: { id: "withholding-child" } });
      await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
      await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
      const posting = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: payment.id }, include: { entries: true } });
      assert.equal(posting.governmentEntityId, "ente");
      assert.equal(posting.budgetUnitId, "ug");
      assert.equal(posting.entries.length, 6);
      assert.equal(posting.entries.find(entry => entry.accountId === "cash")!.valueDecimal!.toFixed(2), "1.80");
      assert.equal(posting.entries.find(entry => entry.accountId === "withholding")!.valueDecimal!.toFixed(2), "0.45");
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "98.20");
      await configureAccountingPostingRule(f.db, f.actor, { ...configuration, components: [] });
      await reversePayment(f.db, f.actor, payment.id, "Devolução do pagamento composto");
      const reversed = await f.db.accountingTransaction.findUniqueOrThrow({ where: { reversalOfId: posting.id }, include: { entries: true } });
      assert.equal(reversed.entries.length, 6, "Estorno conserva todas as pernas após alteração da matriz");
      assert.equal((await getBankAccountBalance(f.db, "banco")).toFixed(2), "100.00");
      await cancelSettlement(f.db, f.actor, settlement.id);
      await cancelCommitment(f.db, f.actor, commitment.id);
      const commitmentReversal = await f.db.accountingTransaction.findUniqueOrThrow({ where: { reversalOfId: commitmentPosting.id }, include: { entries: true } });
      assert.equal(commitmentReversal.entries.length, 4);
      await assert.rejects(configureAccountingPostingRule(f.db, f.actor, { ...configuration, eventCode: "WRONG_ORIGIN" }), /exclusivas do evento/);
      await configureAccountingPostingRule(f.db, f.actor, configuration);
      await assert.rejects(postAccountingEvent(f.db, f.actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, eventCode: "PAGAMENTO_EFETIVADO", value: "2.25", history: "Origem indevida", sourceModule: "TEST", sourceType: "FAKE_PAYMENT", idempotencyKey: "fake-payment" }), /pagamento financeiro canônico/);
      assert.equal(await f.db.accountingTransaction.count({ where: { idempotencyKey: "fake-payment" } }), 0);
    } finally { await f.close(); }
  });
}
