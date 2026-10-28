import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { accountingComponents, accountingEntries, accountingPlans, accountingTransactions } from "../src/db/schema/finance-accounting";
import { financialYears } from "../src/db/schema/finance-years";
import { payments } from "../src/db/schema/finance-payments";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { retentionRules } from "../src/db/schema/finance-settlements";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { configureAccountingPostingRule, createCommitment, createCommitmentMovement, cancelCommitment, createSettlement, cancelSettlement, createPayment, createRevenue, updatePaymentStatus, reversePayment, getBankAccountBalance, postAccountingEvent } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Composição ${jurisdiction}: orçamento, passivo, banco e retenções são atômicos e estornáveis`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      await db.insert(accountingPlans).values([
        { id: "cash", code: "ISOLATED.CASH", name: "Banco", type: "Ativo" },
        { id: "liability", code: "ISOLATED.LIABILITY", name: "Fornecedor", type: "Passivo" },
        { id: "withholding", code: "ISOLATED.WITHHOLDING", name: "Retenções", type: "Passivo" },
        { id: "control-available", code: "ISOLATED.CONTROL_AVAILABLE", name: "Recursos disponíveis", type: "Controle" },
        { id: "control-committed", code: "ISOLATED.CONTROL_COMMITTED", name: "Recursos comprometidos", type: "Controle" },
      ]);
      await db.update(reconciliationBankAccounts).set({ accountingPlanId: "cash" }).where(eq(reconciliationBankAccounts.id, "banco"));
      const components = [
        { debitAccountId: "liability", creditAccountId: "cash", valueBasis: "PAYMENT_NET" as const, creditFromOriginBank: true },
        { debitAccountId: "liability", creditAccountId: "withholding", valueBasis: "PAYMENT_RETENTION" as const },
      ];
      const configuration = { eventCode: "PAGAMENTO_EFETIVADO", eventName: "Pagamento composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components };
      const rule = await configureAccountingPostingRule(connection, f.actor, configuration);
      const componentCount = async () => (await db.select({ total: count() }).from(accountingComponents).where(eq(accountingComponents.ruleId, rule.id)))[0].total;
      await assert.rejects(configureAccountingPostingRule(connection, f.actor, { ...configuration, components: [components[0], components[0]] }), /repetir o mesmo par/);
      await configureAccountingPostingRule(connection, f.actor, { ...configuration, components: undefined });
      assert.equal(await componentCount(), 2, "Editor legado preserva componentes existentes");
      await assert.rejects(configureAccountingPostingRule(connection, f.actor, { ...configuration, components: [{ ...components[0], debitAccountId: "missing" }] }), /nao foram encontradas/);
      assert.equal(await componentCount(), 2);
      await configureAccountingPostingRule(connection, f.actor, { eventCode: "EMPENHO_EMITIDO", eventName: "Empenho composto", debitAccountId: "debito", creditAccountId: "credito", isReference: true, components: [{ debitAccountId: "control-available", creditAccountId: "control-committed", valueBasis: "EVENT_VALUE" }] });
      await createRevenue(connection, f.actor, { date: new Date("2026-09-01"), value: "100.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "funding" });
      const reservation = await f.reserve("compound-reserve", "2.25");
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number: "NE-COMP", value: "2.25", type: "Ordinário", history: "Serviço municipal", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      const [commitmentPosting] = await db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "COMMITMENT"), eq(accountingTransactions.sourceId, commitment.id))).limit(1);
      assert.ok(commitmentPosting);
      const entries = (id: string) => db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, id));
      assert.equal((await entries(commitmentPosting.id)).length, 4);
      for (const type of ["Reforço", "Anulação"] as const) await createCommitmentMovement(connection, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-01"), type, value: "0.25", justification: "Ajuste fundamentado do saldo" });
      await db.insert(retentionRules).values({ id: "retention", code: "IRRF-COMP", type: "IRRF", description: "Retenção municipal de ensaio", beneficiaryName: "Ente municipal", calculationBasePercentage: 100, ratePercentage: 20, financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true });
      const settlement = await createSettlement(connection, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["retention"] });
      const date = new Date("2026-09-03");
      const payment = await createPayment(connection, f.actor, { orderNumber: "OP-COMP", date, value: "2.25", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
      await db.insert(accountingPlans).values({ id: "withholding-child", code: "ISOLATED.WITHHOLDING.CHILD", name: "Desdobramento da retenção", type: "Passivo" });
      await assert.rejects(updatePaymentStatus(connection, f.actor, payment.id, "Paga"), /conta analítica de último nível/);
      assert.equal((await db.select().from(payments).where(eq(payments.id, payment.id)))[0].status, "Emitida");
      assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "PAYMENT"), eq(accountingTransactions.sourceId, payment.id))))[0].total, 0);
      assert.equal((await db.select({ total: count() }).from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.sourceType, "PAYMENT"), eq(reconciliationTreasuryMovements.sourceId, payment.id))))[0].total, 0);
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "100.00");
      await db.delete(accountingPlans).where(eq(accountingPlans.id, "withholding-child"));
      await updatePaymentStatus(connection, f.actor, payment.id, "Paga");
      await updatePaymentStatus(connection, f.actor, payment.id, "Paga");
      const [posting] = await db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "PAYMENT"), eq(accountingTransactions.sourceId, payment.id))).limit(1);
      assert.ok(posting);
      const postingEntries = await entries(posting.id);
      assert.equal(posting.governmentEntityId, "ente");
      assert.equal(posting.budgetUnitId, "ug");
      assert.equal(postingEntries.length, 6);
      assert.equal(postingEntries.find(entry => entry.accountId === "cash")!.valueDecimal!.toFixed(2), "1.80");
      assert.equal(postingEntries.find(entry => entry.accountId === "withholding")!.valueDecimal!.toFixed(2), "0.45");
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "98.20");
      await configureAccountingPostingRule(connection, f.actor, { ...configuration, components: [] });
      await reversePayment(connection, f.actor, payment.id, "Devolução do pagamento composto");
      const [reversed] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, posting.id));
      assert.ok(reversed);
      assert.equal((await entries(reversed.id)).length, 6, "Estorno conserva todas as pernas após alteração da matriz");
      assert.equal((await getBankAccountBalance(db, "banco")).toFixed(2), "100.00");
      await cancelSettlement(connection, f.actor, settlement.id);
      await cancelCommitment(connection, f.actor, commitment.id);
      const [commitmentReversal] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, commitmentPosting.id));
      assert.ok(commitmentReversal);
      assert.equal((await entries(commitmentReversal.id)).length, 4);
      await assert.rejects(configureAccountingPostingRule(connection, f.actor, { ...configuration, eventCode: "WRONG_ORIGIN" }), /exclusivas do evento/);
      await configureAccountingPostingRule(connection, f.actor, configuration);
      await assert.rejects(postAccountingEvent(connection, f.actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date, eventCode: "PAGAMENTO_EFETIVADO", value: "2.25", history: "Origem indevida", sourceModule: "TEST", sourceType: "FAKE_PAYMENT", idempotencyKey: "fake-payment" }), /pagamento financeiro canônico/);
      assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, "fake-payment")))[0].total, 0);
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
