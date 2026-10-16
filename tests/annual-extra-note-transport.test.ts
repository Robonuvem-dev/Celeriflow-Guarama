import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createCommitment, createSettlement, createPayment, createRevenue, updatePaymentStatus, configureAccountingPostingRule, settleWithholdingPayable } from "../src/lib/financeiro";
import { executeAnnualExtraNoteTransport, undoAnnualExtraNoteTransport } from "../src/lib/financeiro/annual-extra-note-transport";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Notas extra ${jurisdiction}: cópia documental, dívida única, replay e desmovimentação separada`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId, allowedBudgetUnitIds: undefined };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("extra-reserve", "3.00");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "NE-EXTRA", value: "3.00", type: "Ordinário", history: "Obrigação com consignação", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await f.db.retentionRule.create({ data: { id: "extra-retention", code: "IRRF-EXTRA", type: "IRRF", description: "Consignação", beneficiaryName: "Ente", calculationBasePercentage: 100, ratePercentage: 20, financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true } });
      const settlement = await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "3.00", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal", retentionRuleIds: ["extra-retention"] });
      await createRevenue(f.db, f.actor, { date: new Date("2026-09-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "RECEIPT", idempotencyKey: "extra-funding" });
      const payment = await createPayment(f.db, f.actor, { orderNumber: "OP-EXTRA", date: new Date("2026-09-03"), value: "3.00", commitmentId: commitment.id, settlementId: settlement.id, bankAccountId: "banco", supplierId: "fornecedor", paymentMethod: "Transferência" });
      await updatePaymentStatus(f.db, f.actor, payment.id, "Paga");
      const payable = await f.db.withholdingPayable.findFirstOrThrow();
      await f.db.taxRegistryEntry.create({ data: { id: "extra-credit", entityType: "TAXPAYER", entityId: "taxpayer", title: "Crédito extraorçamentário", category: "TAX_CREDIT", status: "DISPONIVEL", data: { governmentEntityId: "ente", budgetUnitId: "ug", financialYearId: "ano", bankAccountId: "banco", resourceSourceId: "livre", ingressMovementId: "extra-credit-ingress", available: "0.50" } } });
      await f.db.taxRegistryEntry.create({ data: { id: "extra-refund-reserved", entityType: "TAXPAYER", entityId: "taxpayer", title: "Restituição reservada", category: "REFUND_REQUEST", status: "PENDENTE_APROVACAO", data: { sourceCreditId: "extra-credit", amount: "0.20" } } });
      await f.db.treasuryMovement.create({ data: { id: "extra-credit-ingress", date: new Date("2026-09-03"), bankAccountId: "banco", financialYearId: "ano", resourceSourceId: "livre", type: "ExtraBudgetReceipt", direction: "Entrada", valueDecimal: "0.70", status: "Confirmado", sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT", sourceId: "extra-credit", eventType: "TAX_COLLECTION_EXCESS", idempotencyKey: "extra-credit-ingress" } });
      await f.db.financialYear.create({ data: { id: "next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
      const input = { sourceFinancialYearId: "ano", targetFinancialYearId: "next", reason: "Notas a pagar transportadas para o exercício seguinte", requestKey: "extra-1" };
      await assert.rejects(executeAnnualExtraNoteTransport(f.db, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualExtraNoteTransport(f.db, actor, input), /origem encerrada/);
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Encerrado" } });
      const before = await readResourceAvailability(f.db, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] });
      assert.equal(before.rows[0].extraPayables, "1.30");
      const bankBefore = await f.db.treasuryMovement.count();
      const concurrent = await Promise.all([executeAnnualExtraNoteTransport(f.db, actor, input), executeAnnualExtraNoteTransport(f.db, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const stage = concurrent.find(result => !result.replay)!;
      assert.equal(await f.db.financialAuditLog.count({ where: { action: "ANNUAL_EXTRA_NOTE_COPY", financialYearId: "next" } }), 2);
      assert.equal(await f.db.treasuryMovement.count(), bankBefore);
      assert.equal((await readResourceAvailability(f.db, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] })).rows[0].extraPayables, "1.30");
      await assert.rejects(executeAnnualExtraNoteTransport(f.db, actor, { ...input, requestKey: "extra-active-copy" }), /edição extraorçamentária vigente/);
      await undoAnnualExtraNoteTransport(f.db, actor, { stageId: stage.stageId, reason: "Conferência independente das notas" });
      assert.equal((await undoAnnualExtraNoteTransport(f.db, actor, { stageId: stage.stageId, reason: "Conferência independente das notas" })).replay, true);
      const repeated = await executeAnnualExtraNoteTransport(f.db, actor, { ...input, requestKey: "extra-2" });
      await configureAccountingPostingRule(f.db, actor, { eventCode: "RETENCAO_RECOLHIDA", eventName: "Recolhimento de consignação", debitAccountId: "credito", creditAccountId: "debito", isReference: true });
      await settleWithholdingPayable(f.db, f.actor, { withholdingPayableId: payable.id, bankAccountId: "banco", paymentDate: new Date("2027-09-01"), receiptDocumentId: "documento-fiscal", idempotencyKey: "settle-transported-extra" });
      assert.equal((await readResourceAvailability(f.db, actor, { financialYearId: "next", governmentEntityId: "ente", resourceSourceIds: ["livre"] })).rows[0].extraPayables, "0.70");
      await assert.rejects(undoAnnualExtraNoteTransport(f.db, actor, { stageId: repeated.stageId, reason: "Tentativa após recolhimento" }), /pagamento, restituição/);
      await assert.rejects(settleWithholdingPayable(f.db, f.actor, { withholdingPayableId: payable.id, bankAccountId: "banco", paymentDate: new Date("2027-09-01"), receiptDocumentId: "documento-fiscal" }), /já recolhida/);
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
