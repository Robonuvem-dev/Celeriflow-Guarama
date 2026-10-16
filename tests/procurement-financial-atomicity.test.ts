import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { approveExpenseRequest, getBudgetAvailability } from "../src/lib/financeiro";
import { createCommitmentFromExpenseAuthorization, deriveExpenseAuthorizationsForContract, cancelCommitmentForCancelledContract, createSettlementFromPurchaseReceiptAuthorization, createSettlementFromInstrumentMeasurementAuthorization, cancelSettlementAfterPurchaseReceiptCancellation, cancelSettlementAfterInstrumentMeasurementCancellation } from "../src/lib/compras/procurement-finance-bridge";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P4 ${jurisdiction}: evento de Compras, reserva e empenho são atômicos e replay verifica escopo/conteúdo`, async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await f.pg.exec(`INSERT INTO "PurchaseRequest" (id,number,object,justification,"secretariatId","departmentId","requesterId") VALUES ('solicitacao','SC-2026','Serviços municipais','Necessidade municipal','secretaria','departamento','servidora-ana');
      INSERT INTO "PurchaseRequestItem" (id,"purchaseRequestId","customName",quantity) VALUES ('item-solicitacao','solicitacao','Serviço municipal',1);
      INSERT INTO "PurchaseRequestItemBudgetAllocation" (id,"purchaseRequestItemId","budgetAppropriationId",quantity,"valueDecimal") VALUES ('alocacao','item-solicitacao','${f.appropriationId}',1,2);
      INSERT INTO "PurchaseProcess" (id,number,object,type,"secretariatId","purchaseRequestId") VALUES ('processo','PC-2026','Serviços municipais','Comum','secretaria','solicitacao');
      INSERT INTO "PurchaseProcessItem" (id,"purchaseProcessId","customName",quantity) VALUES ('item-processo','processo','Serviço municipal',1);
      INSERT INTO "Contract" (id,number,object,"initialValue","updatedValue","startDate","endDate",status,"processId","supplierId","secretariatId","sourceBudgetUnitId") VALUES ('contrato','CT-2026','Serviços municipais',2,2,'2026-01-01','2026-12-31','Vigente','processo','fornecedor','secretaria','ug');`);
    const [authorization] = await deriveExpenseAuthorizationsForContract(f.db, f.actor, "contrato", new Date("2026-09-01"));
    await approveExpenseRequest(f.db, f.financeReviewer, authorization.expenseId);
    const input = { expenseId: authorization.expenseId, reservationNumber: "RF-2026", commitmentNumber: "NE-2026", date: new Date("2026-09-01"), type: "Ordinário" };
    await f.pg.exec(`CREATE FUNCTION fail_procurement_commit_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_COMMITMENT_CREATED' THEN RAISE EXCEPTION 'injected procurement event failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_commit_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_commit_event();`);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.db, f.actor, input), /injected procurement event failure/i);
    assert.equal(await f.db.commitment.count(), 0);
    assert.equal(await f.db.budgetReservation.count(), 0);
    assert.equal(await f.db.financialDocument.count(), 0);
    assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "COMMITMENT" } }), 0);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "0.00");
    assert.equal((await f.db.expense.findUniqueOrThrow({ where: { id: input.expenseId } })).status, "Aprovada");
    await f.pg.exec(`DROP TRIGGER fail_procurement_commit_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_commit_event();`);
    const posted = await createCommitmentFromExpenseAuthorization(f.db, f.actor, input);
    assert.equal((await createCommitmentFromExpenseAuthorization(f.db, f.actor, input)).commitment.id, posted.commitment.id);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /unidades autorizadas/i);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.db, f.actor, { ...input, type: "Global" }), /outros dados/i);
    await assert.rejects(createCommitmentFromExpenseAuthorization(f.db, f.actor, { ...input, date: new Date("2026-09-02") }), /outros dados/i);
    assert.equal(await f.db.commitment.count(), 1);
    assert.equal(await f.db.budgetReservation.count(), 1);
    assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PROCUREMENT_COMMITMENT_CREATED" } }), 1);
    await f.db.contract.update({ where: { id: "contrato" }, data: { status: "Suspenso" } });
    await f.pg.exec(`CREATE FUNCTION fail_procurement_cancel_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_COMMITMENT_CANCELLED' THEN RAISE EXCEPTION 'injected procurement cancellation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_cancel_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_cancel_event();`);
    await assert.rejects(cancelCommitmentForCancelledContract(f.db, f.actor, posted.commitment.id), /injected procurement cancellation failure/i);
    assert.equal((await f.db.commitment.findUniqueOrThrow({ where: { id: posted.commitment.id } })).status, posted.commitment.status);
    assert.equal(await f.db.commitmentMovement.count(), 0);
    assert.equal(await f.db.accountingTransaction.count({ where: { reversalOfId: { not: null } } }), 0);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "2.00");
    await f.pg.exec(`DROP TRIGGER fail_procurement_cancel_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_cancel_event();`);
    const canceled = await cancelCommitmentForCancelledContract(f.db, f.actor, posted.commitment.id);
    assert.equal((await cancelCommitmentForCancelledContract(f.db, f.actor, posted.commitment.id)).eventId, canceled.eventId);
    await assert.rejects(cancelCommitmentForCancelledContract(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, posted.commitment.id), /unidades autorizadas/i);
    assert.equal((await getBudgetAvailability(f.db, f.appropriationId)).committed.toFixed(2), "0.00");
    assert.equal(await f.db.commitmentMovement.count(), 1);
    assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PROCUREMENT_COMMITMENT_CANCELLED" } }), 1);
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
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await f.pg.exec(`INSERT INTO "PurchaseRequest" (id,number,object,justification,"secretariatId","departmentId","requesterId") VALUES ('solicitacao','SC-2026','Serviços municipais','Necessidade municipal','secretaria','departamento','servidora-ana');
      INSERT INTO "PurchaseRequestItem" (id,"purchaseRequestId","customName",quantity) VALUES ('item-solicitacao','solicitacao','Serviço municipal',1);
      INSERT INTO "PurchaseRequestItemBudgetAllocation" (id,"purchaseRequestItemId","budgetAppropriationId",quantity,"valueDecimal") VALUES ('alocacao','item-solicitacao','${f.appropriationId}',1,2);
      INSERT INTO "PurchaseProcess" (id,number,object,type,"secretariatId","purchaseRequestId") VALUES ('processo','PC-2026','Serviços municipais','Comum','secretaria','solicitacao');
      INSERT INTO "PurchaseProcessItem" (id,"purchaseProcessId","customName",quantity) VALUES ('item-processo','processo','Serviço municipal',1);
      INSERT INTO "Contract" (id,number,object,"initialValue","updatedValue","startDate","endDate",status,"processId","supplierId","secretariatId","sourceBudgetUnitId") VALUES ('contrato','CT-2026','Serviços municipais',2,2,'2026-01-01','2026-12-31','Vigente','processo','fornecedor','secretaria','ug');
      INSERT INTO "PurchaseReceipt" (id,number,status,"receivedAt","contractId","purchaseProcessId","documentId","receiverId","attesterId","idempotencyKey","sourceId") VALUES ('recebimento','REC-2026','APPROVED','2026-09-02','contrato','processo','documento-fiscal','servidora-ana','servidora-ana','receipt-origin','contrato');
      INSERT INTO "PurchaseReceiptItem" (id,"purchaseReceiptId","purchaseProcessItemId",quantity,"unitCost") VALUES ('receipt-item','recebimento','item-processo',1,2);
      INSERT INTO "InstrumentMeasurement" (id,number,status,"measuredAt","valueDecimal","documentId","contractId") VALUES ('medicao',1,'Atestada','2026-09-02',2,'documento-fiscal','contrato');`);
    const [authorization] = await deriveExpenseAuthorizationsForContract(f.db, f.actor, "contrato", new Date("2026-09-01"));
    await approveExpenseRequest(f.db, f.financeReviewer, authorization.expenseId);
    const posted = await createCommitmentFromExpenseAuthorization(f.db, f.actor, { expenseId: authorization.expenseId, reservationNumber: "RF-2026", commitmentNumber: "NE-2026", date: new Date("2026-09-01"), type: "Ordinário" });
    await f.db.retentionRule.create({ data: { id: "retencao", code: "MUNICIPAL.IRRF", type: "IRRF", description: "Retenção tributária", calculationBasePercentage: 100, ratePercentage: 20, beneficiaryName: "Ente Municipal", financialYearId: "ano", effectiveFrom: new Date("2026-01-01"), isActive: true } });
    const input = { commitmentId: posted.commitment.id, date: new Date("2026-09-02"), fiscalDocumentNumber: "NF-2026", fiscalDocumentIssueDate: new Date("2026-09-02"), notes: "Documento fiscal atestado", retentionRuleIds: ["retencao"] };
    const execute = (actor = f.actor, data = input) => source === "RECEIPT"
      ? createSettlementFromPurchaseReceiptAuthorization(f.db, actor, { ...data, purchaseReceiptId: "recebimento" })
      : createSettlementFromInstrumentMeasurementAuthorization(f.db, actor, { ...data, measurementId: "medicao", authorId: "servidora-ana" });
    await f.pg.exec(`CREATE FUNCTION fail_procurement_settlement_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_SETTLEMENT_CREATED' THEN RAISE EXCEPTION 'injected settlement event failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_settlement_event BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_settlement_event();`);
    await assert.rejects(execute(), /injected settlement event failure/i);
    assert.equal(await f.db.settlement.count(), 0);
    assert.equal(await f.db.settlementRetention.count(), 0);
    assert.equal(await f.db.financialDocument.count({ where: { documentType: "NOTA_DE_LIQUIDACAO" } }), 0);
    assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "SETTLEMENT" } }), 0);
    assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CREATED" } }), 0);
    await f.pg.exec(`DROP TRIGGER fail_procurement_settlement_event ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_settlement_event();`);
    const liquidated = await execute();
    assert.equal((await execute()).settlement.id, liquidated.settlement.id);
    await assert.rejects(execute({ ...f.actor, allowedBudgetUnitIds: [] }), /unidades autorizadas/i);
    await assert.rejects(execute(f.actor, { ...input, fiscalDocumentNumber: "NF-ALTERADA" }), /outros dados/i);
    await assert.rejects(execute(f.actor, { ...input, date: new Date("2026-09-03") }), /outros dados/i);
    await assert.rejects(execute(f.actor, { ...input, retentionRuleIds: [] }), /outros dados/i);
    assert.equal(await f.db.settlement.count(), 1);
    assert.equal((await f.db.settlementRetention.findFirstOrThrow()).valueDecimal.toFixed(2), "0.40");
    assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PROCUREMENT_SETTLEMENT_CREATED" } }), 1);
    await f.db.purchaseReceipt.update({ where: { id: "recebimento" }, data: { status: "CANCELLED" } });
    await f.db.instrumentMeasurement.update({ where: { id: "medicao" }, data: { status: "Cancelada" } });
    const cancel = (actor = f.actor) => source === "RECEIPT"
      ? cancelSettlementAfterPurchaseReceiptCancellation(f.db, actor, { purchaseReceiptId: "recebimento", settlementId: liquidated.settlement.id })
      : cancelSettlementAfterInstrumentMeasurementCancellation(f.db, actor, { measurementId: "medicao", settlementId: liquidated.settlement.id });
    await f.pg.exec(`CREATE FUNCTION fail_procurement_settlement_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PROCUREMENT_SETTLEMENT_CANCELLED' THEN RAISE EXCEPTION 'injected settlement cancellation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_procurement_settlement_cancel BEFORE INSERT ON "ProcurementLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION fail_procurement_settlement_cancel();`);
    await assert.rejects(cancel(), /injected settlement cancellation failure/i);
    assert.equal((await f.db.settlement.findUniqueOrThrow({ where: { id: liquidated.settlement.id } })).status, "Liquidado");
    assert.equal(await f.db.accountingTransaction.count({ where: { reversalOfId: { not: null } } }), 0);
    assert.equal(await f.db.procurementLifecycleEvent.count({ where: { eventType: "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CANCELLED" } }), 0);
    await f.pg.exec(`DROP TRIGGER fail_procurement_settlement_cancel ON "ProcurementLifecycleEvent"; DROP FUNCTION fail_procurement_settlement_cancel();`);
    const canceled = await cancel();
    assert.equal((await cancel()).eventId, canceled.eventId);
    await assert.rejects(cancel({ ...f.actor, allowedBudgetUnitIds: [] }), /unidades autorizadas/i);
    assert.equal(await f.db.accountingTransaction.count({ where: { eventType: "LIQUIDACAO_CANCELADA" } }), 1);
    assert.equal(await f.db.settlementRetention.count(), 1);
    assert.equal((await f.db.settlement.findUniqueOrThrow({ where: { id: liquidated.settlement.id } })).status, "Cancelado");
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
