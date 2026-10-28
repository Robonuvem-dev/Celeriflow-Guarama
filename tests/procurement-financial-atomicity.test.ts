import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { financeDatabaseError } from "./helpers/finance-database-error";
import { approveExpenseRequest, getBudgetAvailability } from "../src/lib/financeiro";
import { createCommitmentFromExpenseAuthorization, deriveExpenseAuthorizationsForContract, cancelCommitmentForCancelledContract, createSettlementFromPurchaseReceiptAuthorization, createSettlementFromInstrumentMeasurementAuthorization, cancelSettlementAfterPurchaseReceiptCancellation, cancelSettlementAfterInstrumentMeasurementCancellation } from "../src/lib/compras/procurement-finance-bridge";
import { count, eq, isNotNull } from "drizzle-orm";
import { financialYears } from "../src/db/schema/finance-years";
import { accountingTransactions } from "../src/db/schema/finance-accounting";
import { commitments, commitmentMovements, budgetReservations } from "../src/db/schema/finance-budget";
import { financialDocuments } from "../src/db/schema/finance-documents";
import { expenses } from "../src/db/schema/finance-expenses";
import { procurementContracts } from "../src/db/schema/procurement-core";
import { procurementLifecycleEvents, purchaseReceipts, purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations as purchaseRequestItemBudgetAllocations, purchaseReceiptItems } from "../src/db/schema/procurement-requests";
import { materialCategories, materials, materialMovements, warehouses } from "../src/db/schema/assets-stock";
import { purchaseProcesses, purchaseProcessItems } from "../src/db/schema/procurement-core";
import { departments } from "../src/db/schema/administration";
import { Decimal } from "../src/db/decimal";
import { instrumentMeasurements } from "../src/db/schema/procurement-instruments";
import { settlements, retentionRules, settlementRetentions } from "../src/db/schema/finance-settlements";

async function seedContract(f: Awaited<ReturnType<typeof createPlanningExecutionFixture>>) {
  await f.db.insert(departments).values({ id: "departamento", name: "Administração", secretariatId: "secretaria" });
  await f.db.insert(purchaseRequests).values({ id: "solicitacao", number: "SC-2026", object: "Serviços municipais", justification: "Necessidade municipal", secretariatId: "secretaria", departmentId: "departamento", requesterId: "servidora-ana" });
  await f.db.insert(purchaseRequestItems).values({ id: "item-solicitacao", purchaseRequestId: "solicitacao", customName: "Serviço municipal", quantity: 1 });
  await f.db.insert(purchaseRequestItemBudgetAllocations).values({ id: "alocacao", purchaseRequestItemId: "item-solicitacao", budgetAppropriationId: f.appropriationId, quantity: 1, valueDecimal: new Decimal(2) });
  await f.db.insert(purchaseProcesses).values({ id: "processo", number: "PC-2026", object: "Serviços municipais", type: "Comum", secretariatId: "secretaria", purchaseRequestId: "solicitacao" });
  await f.db.insert(purchaseProcessItems).values({ id: "item-processo", purchaseProcessId: "processo", customName: "Serviço municipal", quantity: 1 });
  await f.db.insert(procurementContracts).values({ id: "contrato", number: "CT-2026", object: "Serviços municipais", initialValue: 2, updatedValue: 2, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "Vigente", processId: "processo", supplierId: "fornecedor", secretariatId: "secretaria", sourceBudgetUnitId: "ug" });
}

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P4 ${jurisdiction}: evento de Compras, reserva e empenho são atômicos e replay verifica escopo/conteúdo`, async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  try {
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await seedContract(f);
    const [authorization] = await deriveExpenseAuthorizationsForContract(f.connection, f.actor, "contrato", new Date("2026-09-01"));
    await approveExpenseRequest(f.connection, f.financeReviewer, authorization.expenseId);
    const input = { expenseId: authorization.expenseId, reservationNumber: "RF-2026", commitmentNumber: "NE-2026", date: new Date("2026-09-01"), type: "Ordinário" };
    await f.pg.exec(`CREATE FUNCTION fail_procurement_commit_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_COMMITMENT_CREATED' THEN RAISE EXCEPTION 'injected procurement event failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_commit_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_commit_event();`);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.connection, f.actor, input), financeDatabaseError(/injected procurement event failure/i));
    assert.equal((await f.db.select({ value: count() }).from(commitments))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(budgetReservations))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(financialDocuments))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceType, "COMMITMENT")))[0].value, 0);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "0.00");
    assert.equal((await f.db.select().from(expenses).where(eq(expenses.id, input.expenseId)))[0].status, "Aprovada");
    await f.pg.exec(`DROP TRIGGER fail_procurement_commit_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_commit_event();`);
    const posted = await createCommitmentFromExpenseAuthorization(f.connection, f.actor, input);
    assert.equal((await createCommitmentFromExpenseAuthorization(f.connection, f.actor, input)).commitment.id, posted.commitment.id);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /unidades autorizadas/i);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.connection, f.actor, { ...input, type: "Global" }), /outros dados/i);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.connection, f.actor, { ...input, date: new Date("2026-09-02") }), /outros dados/i);
    assert.equal((await f.db.select({ value: count() }).from(commitments))[0].value, 1);
    assert.equal((await f.db.select({ value: count() }).from(budgetReservations))[0].value, 1);
    assert.equal((await f.db.select({ value: count() }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PROCUREMENT_COMMITMENT_CREATED")))[0].value, 1);
    await f.db.update(procurementContracts).set({ status: "Suspenso" }).where(eq(procurementContracts.id, "contrato"));
    await f.pg.exec(`CREATE FUNCTION fail_procurement_cancel_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_COMMITMENT_CANCELLED' THEN RAISE EXCEPTION 'injected procurement cancellation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_cancel_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_cancel_event();`);
    await assert.rejects(cancelCommitmentForCancelledContract(f.connection, f.actor, posted.commitment.id), financeDatabaseError(/injected procurement cancellation failure/i));
    assert.equal((await f.db.select().from(commitments).where(eq(commitments.id, posted.commitment.id)))[0].status, posted.commitment.status);
    assert.equal((await f.db.select({ value: count() }).from(commitmentMovements))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(isNotNull(accountingTransactions.reversalOfId)))[0].value, 0);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "2.00");
    await f.pg.exec(`DROP TRIGGER fail_procurement_cancel_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_cancel_event();`);
    const canceled = await cancelCommitmentForCancelledContract(f.connection, f.actor, posted.commitment.id);
    assert.equal((await cancelCommitmentForCancelledContract(f.connection, f.actor, posted.commitment.id)).eventId, canceled.eventId);
    await assert.rejects(cancelCommitmentForCancelledContract(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, posted.commitment.id), /unidades autorizadas/i);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "0.00");
    assert.equal((await f.db.select({ value: count() }).from(commitmentMovements))[0].value, 1);
    assert.equal((await f.db.select({ value: count() }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PROCUREMENT_COMMITMENT_CANCELLED")))[0].value, 1);
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) for (const source of ["RECEIPT", "MEASUREMENT"] as const) test(`Compras ${jurisdiction} ${source}: autorização e liquidação revertem na falha do evento final e replay confere escopo/documento`, async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  try {
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await seedContract(f);
    await f.db.insert(purchaseReceipts).values({ id: "recebimento", number: "REC-2026", status: "APPROVED", receivedAt: new Date("2026-09-02"), contractId: "contrato", purchaseProcessId: "processo", documentId: "documento-fiscal", receiverId: "servidora-ana", attesterId: "servidora-ana", idempotencyKey: "receipt-origin", sourceId: "contrato" });
    await f.db.insert(materialCategories).values({ id: "category", code: "TEST", name: "Materiais municipais" });
    await f.db.insert(materials).values({ id: "material", code: "TEST", name: "Material municipal", categoryId: "category" });
    await f.db.insert(warehouses).values({ id: "warehouse", name: "Almoxarifado" });
    await f.db.insert(materialMovements).values({ id: "receipt-movement", type: "Entrada", quantity: 1, unitValue: 2, materialId: "material", warehouseId: "warehouse" });
    await f.db.insert(purchaseReceiptItems).values({ id: "receipt-item", purchaseReceiptId: "recebimento", purchaseProcessItemId: "item-processo", materialId: "material", warehouseId: "warehouse", stockMovementId: "receipt-movement", quantity: 1, unitCost: 2 });
    await f.db.insert(instrumentMeasurements).values({ id: "medicao", number: 1, status: "Atestada", measuredAt: new Date("2026-09-02"), valueDecimal: new Decimal(2), documentId: "documento-fiscal", contractId: "contrato" });
    const [authorization] = await deriveExpenseAuthorizationsForContract(f.connection, f.actor, "contrato", new Date("2026-09-01"));
    await approveExpenseRequest(f.connection, f.financeReviewer, authorization.expenseId);
    const posted = await createCommitmentFromExpenseAuthorization(f.connection, f.actor, { expenseId: authorization.expenseId, reservationNumber: "RF-2026", commitmentNumber: "NE-2026", date: new Date("2026-09-01"), type: "Ordinário" });
    await f.db.insert(retentionRules).values({ id: "retencao", code: "MUNICIPAL.IRRF", type: "IRRF", description: "Retenção tributária", calculationBasePercentage: new Decimal(100), ratePercentage: new Decimal(20), beneficiaryName: "Ente Municipal", financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true });
    const input = { commitmentId: posted.commitment.id, date: new Date("2026-09-02"), fiscalDocumentNumber: "NF-2026", fiscalDocumentIssueDate: new Date("2026-09-02"), notes: "Documento fiscal atestado", retentionRuleIds: ["retencao"] };
    const execute = (actor = f.actor, data = input) => source === "RECEIPT"
      ? createSettlementFromPurchaseReceiptAuthorization(f.connection, actor, { ...data, purchaseReceiptId: "recebimento" })
      : createSettlementFromInstrumentMeasurementAuthorization(f.connection, actor, { ...data, measurementId: "medicao", authorId: "servidora-ana" });
    await f.pg.exec(`CREATE FUNCTION fail_procurement_settlement_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_SETTLEMENT_CREATED' THEN RAISE EXCEPTION 'injected settlement event failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_settlement_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_settlement_event();`);
    await assert.rejects(execute(), financeDatabaseError(/injected settlement event failure/i));
    assert.equal((await f.db.select({ value: count() }).from(settlements))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(settlementRetentions))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(financialDocuments).where(eq(financialDocuments.documentType, "NOTA_DE_LIQUIDACAO")))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceType, "SETTLEMENT")))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CREATED")))[0].value, 0);
    await f.pg.exec(`DROP TRIGGER fail_procurement_settlement_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_settlement_event();`);
    const liquidated = await execute();
    assert.equal((await execute()).settlement.id, liquidated.settlement.id);
    await assert.rejects(execute({ ...f.actor, allowedBudgetUnitIds: [] }), /unidades autorizadas/i);
    await assert.rejects(execute(f.actor, { ...input, fiscalDocumentNumber: "NF-ALTERADA" }), /outros dados/i);
    await assert.rejects(execute(f.actor, { ...input, date: new Date("2026-09-03") }), /outros dados/i);
    await assert.rejects(execute(f.actor, { ...input, retentionRuleIds: [] }), /outros dados/i);
    assert.equal((await f.db.select({ value: count() }).from(settlements))[0].value, 1);
    assert.equal((await f.db.select().from(settlementRetentions).limit(1))[0].valueDecimal.toFixed(2), "0.40");
    assert.equal((await f.db.select({ value: count() }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PROCUREMENT_SETTLEMENT_CREATED")))[0].value, 1);
    await f.db.update(purchaseReceipts).set({ status: "CANCELLED" }).where(eq(purchaseReceipts.id, "recebimento"));
    await f.db.update(instrumentMeasurements).set({ status: "Cancelada" }).where(eq(instrumentMeasurements.id, "medicao"));
    const cancel = (actor = f.actor) => source === "RECEIPT"
      ? cancelSettlementAfterPurchaseReceiptCancellation(f.connection, actor, { purchaseReceiptId: "recebimento", settlementId: liquidated.settlement.id })
      : cancelSettlementAfterInstrumentMeasurementCancellation(f.connection, actor, { measurementId: "medicao", settlementId: liquidated.settlement.id });
    await f.pg.exec(`CREATE FUNCTION fail_procurement_settlement_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_SETTLEMENT_CANCELLED' THEN RAISE EXCEPTION 'injected settlement cancellation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_settlement_cancel BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_settlement_cancel();`);
    await assert.rejects(cancel(), financeDatabaseError(/injected settlement cancellation failure/i));
    assert.equal((await f.db.select().from(settlements).where(eq(settlements.id, liquidated.settlement.id)))[0].status, "Liquidado");
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(isNotNull(accountingTransactions.reversalOfId)))[0].value, 0);
    assert.equal((await f.db.select({ value: count() }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.eventType, "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CANCELLED")))[0].value, 0);
    await f.pg.exec(`DROP TRIGGER fail_procurement_settlement_cancel ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_settlement_cancel();`);
    const canceled = await cancel();
    assert.equal((await cancel()).eventId, canceled.eventId);
    await assert.rejects(cancel({ ...f.actor, allowedBudgetUnitIds: [] }), /unidades autorizadas/i);
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(eq(accountingTransactions.eventType, "LIQUIDACAO_CANCELADA")))[0].value, 1);
    assert.equal((await f.db.select({ value: count() }).from(settlementRetentions))[0].value, 1);
    assert.equal((await f.db.select().from(settlements).where(eq(settlements.id, liquidated.settlement.id)))[0].status, "Cancelado");
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
