import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { financialYears } from "../src/db/schema/finance-years";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { retentionRules } from "../src/db/schema/finance-settlements";
import { withholdingPayables } from "../src/db/schema/finance-payments";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { createCommitment, createSettlement, createPayment, createRevenue, updatePaymentStatus, configureAccountingPostingRule, settleWithholdingPayable } from "../src/lib/financeiro";
import { executeAnnualExtraNoteTransport, undoAnnualExtraNoteTransport } from "../src/lib/financeiro/annual-extra-note-transport";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Notas extra ${jurisdiction}: cópia documental, dívida única, replay e desmovimentação separada`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId, allowedBudgetUnitIds: undefined };
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("extra-reserve", "3.00");
      context.mock.timers.reset();
      const commitment = await createCommitment(connection, f.actor, { date: new Date("2026-09-01"), number: "NE-EXTRA", value: "3.00", type: "Ordinário", history: "Obrigação com consignação", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await db.insert(retentionRules).values({ id: "extra-retention", code: "IRRF-EXTRA", type: "IRRF", description: "Consignação", beneficiaryName: "Ente", calculationBasePercentage: new Decimal("100"), ratePercentage: new Decimal("20"), financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true });
      const settlement = await createSettlement(connection, f.actor, { date: new Date("2026-09-02"), value: "3.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["extra-retention"] });
      await createRevenue(connection, f.actor, { date: new Date("2026-09-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "extra-funding" });
      const payment = await createPayment(connection, f.actor, { orderNumber: "OP-EXTRA", date: new Date("2026-09-03"), value: "3.00", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
      await updatePaymentStatus(connection, f.actor, payment.id, "Paga");
      const [payable] = await db.select().from(withholdingPayables).limit(1);
      assert.ok(payable);
      await db.insert(taxRegistryEntries).values({ id: "extra-credit", entityType: "TAXPAYER", entityId: "taxpayer", title: "Crédito extraorçamentário", category: "TAX_CREDIT", status: "DISPONIVEL", data: { governmentEntityId: "ente", budgetUnitId: "ug", financialYearId: "ano", bankAccountId: "banco", resourceSourceId: "livre", ingressMovementId: "extra-credit-ingress", available: "0.50" } });
      await db.insert(taxRegistryEntries).values({ id: "extra-refund-reserved", entityType: "TAXPAYER", entityId: "taxpayer", title: "Restituição reservada", category: "REFUND_REQUEST", status: "PENDENTE_APROVACAO", data: { sourceCreditId: "extra-credit", amount: "0.20" } });
      await db.insert(reconciliationTreasuryMovements).values({ id: "extra-credit-ingress", date: new Date("2026-09-03"), bankAccountId: "banco", financialYearId: "ano", resourceSourceId: "livre", type: "ExtraBudgetReceipt", direction: "Entrada", valueDecimal: new Decimal("0.70"), status: "Confirmado", sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT", sourceId: "extra-credit", eventType: "TAX_COLLECTION_EXCESS", idempotencyKey: "extra-credit-ingress" });
      await db.insert(financialYears).values({ id: "next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") });
      const input = { sourceFinancialYearId: "ano", targetFinancialYearId: "next", reason: "Notas a pagar transportadas para o exercício seguinte", requestKey: "extra-1" };
      await assert.rejects(executeAnnualExtraNoteTransport(connection, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualExtraNoteTransport(connection, actor, input), /origem encerrada/);
      await db.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano"));
      const before = await readResourceAvailability(connection, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] });
      assert.equal(before.rows[0].extraPayables, "1.30");
      const bankCount = async () => (await db.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total;
      const bankBefore = await bankCount();
      const concurrent = await Promise.all([executeAnnualExtraNoteTransport(connection, actor, input), executeAnnualExtraNoteTransport(connection, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const stage = concurrent.find(result => !result.replay)!;
      assert.equal((await db.select({ total: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ANNUAL_EXTRA_NOTE_COPY"), eq(financialAuditLogs.financialYearId, "next"))))[0].total, 2);
      assert.equal(await bankCount(), bankBefore);
      assert.equal((await readResourceAvailability(connection, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] })).rows[0].extraPayables, "1.30");
      await assert.rejects(executeAnnualExtraNoteTransport(connection, actor, { ...input, requestKey: "extra-active-copy" }), /edição extraorçamentária vigente/);
      await undoAnnualExtraNoteTransport(connection, actor, { stageId: stage.stageId, reason: "Conferência independente das notas" });
      assert.equal((await undoAnnualExtraNoteTransport(connection, actor, { stageId: stage.stageId, reason: "Conferência independente das notas" })).replay, true);
      const repeated = await executeAnnualExtraNoteTransport(connection, actor, { ...input, requestKey: "extra-2" });
      await configureAccountingPostingRule(connection, actor, { eventCode: "RETENCAO_RECOLHIDA", eventName: "Recolhimento de consignação", debitAccountId: "credito", creditAccountId: "debito", isReference: true });
      await settleWithholdingPayable(connection, f.actor, { withholdingPayableId: payable.id, bankAccountId: "banco", paymentDate: new Date("2027-09-01"), receiptDocumentId: "documento-fiscal", idempotencyKey: "settle-transported-extra" });
      assert.equal((await readResourceAvailability(connection, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] })).rows[0].extraPayables, "0.70");
      await assert.rejects(undoAnnualExtraNoteTransport(connection, actor, { stageId: repeated.stageId, reason: "Tentativa após recolhimento" }), /pagamento, restituição/);
      await assert.rejects(settleWithholdingPayable(connection, f.actor, { withholdingPayableId: payable.id, bankAccountId: "banco", paymentDate: new Date("2027-09-01"), receiptDocumentId: "documento-fiscal" }), /já recolhida/);
      assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Encerrado");
    } finally { context.mock.timers.reset(); try { await finance?.close(); } finally { await f.close(); } }
  });
}
