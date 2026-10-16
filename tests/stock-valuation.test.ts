import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { reconcileStockValuation } from "../src/lib/patrimonio/stock-valuation";
import { applyStockMovement, returnStockMovement } from "../src/lib/patrimonio/stock-service";
import { createCommitment, createSettlement } from "../src/lib/financeiro";
import { issueMaterialRequestInFull } from "../src/lib/compras/procurement-lifecycle";

async function fixture() {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let f: Awaited<ReturnType<typeof createPlanningExecutionFixture>>;
  try { f = await createPlanningExecutionFixture(2026, 2, "EXECUTIVE", { expenseLineAmount: "600.00" }); }
  finally { if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
  try {
    await f.db.usuario.update({ where: { id: "ana" }, data: { ativo: true } });
    await f.pg.exec('ALTER TABLE "MaterialStock" DROP COLUMN "valuationEnabled"');
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261014160000_stock_valuation/migration.sql", "utf8"));
    // Match the production stock identity: the schema fixture's generic indexes
    // do not include @@unique constraints declared with a custom map name.
    await f.pg.exec('CREATE UNIQUE INDEX "valuation_fixture_stock_identity" ON "MaterialStock" ("warehouseId", "materialId", "batchNumber")');
    await f.db.usuarioUnidadeGestora.create({ data: { usuarioId: "ana", budgetUnitId: "ug" } });
    await f.db.costCenter.create({ data: { id: "value-center", code: "VALUE", name: "Centro conciliado", governmentEntityId: "ente", secretariatId: "secretaria" } });
    await f.db.warehouse.create({ data: { id: "value-warehouse", name: "Almoxarifado", costCenterId: "value-center" } });
    await f.db.materialCategory.create({ data: { id: "value-class", code: "VALUE", name: "Materiais" } });
    await f.db.material.create({ data: { id: "value-material", code: "VALUE", name: "Material", categoryId: "value-class" } });
    await f.db.materialStock.create({ data: { id: "value-stock", warehouseId: "value-warehouse", materialId: "value-material", quantity: 3, unitCost: 100 } });
    await f.db.accountingPlan.createMany({ data: [{ id: "value-asset", code: "1.1.5.6.1", name: "Estoque", type: "Ativo" }, { id: "value-vpd", code: "3.3.1.6.1", name: "Consumo", type: "Despesa" }] });
    await f.db.document.create({ data: { id: "value-document", title: "Conciliação de estoque", documentType: "ESTOQUE:ente:ug", fileUrl: "/memoria.pdf", status: "Válido" } });
    await f.db.documentVersion.create({ data: { id: "value-version", documentId: "value-document", versionNumber: 1, fileUrl: "/memoria.pdf", hashSha256: "a".repeat(64), status: "FINAL" } });
    const opening = { stockId: "value-stock", financialYearId: "ano", budgetUnitId: "ug", quantity: "3", amount: "0.10", inventoryAccountId: "value-asset", consumptionAccountId: "value-vpd", documentVersionId: "value-version", reason: "Saldo inicial conciliado conforme documento de estoque" };
    const input = { warehouseId: "value-warehouse", materialId: "value-material", quantity: 1, actor: f.actor };
    return { ...f, opening, input };
  } catch (error) { await f.close(); throw error; }
}

test("P6: custo médio conserva centavos no último consumo e nas devoluções parciais; histórico é imutável", async () => {
  const f = await fixture();
  try {
    const opening = await reconcileStockValuation(f.db, f.actor, f.opening);
    assert.equal((await reconcileStockValuation(f.db, f.actor, f.opening)).id, opening.id);
    await assert.rejects(reconcileStockValuation(f.db, f.actor, { ...f.opening, amount: "0.11" }), /já conciliada/);
    const issue = await f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "EXIT", quantity: 3, unitCost: 100 }));
    assert.equal(issue.movement.totalValueDecimal?.toFixed(2), "0.10");
    assert.equal((await f.db.materialStockValuation.findUniqueOrThrow({ where: { id: opening.id } })).amount.toFixed(2), "0.00");
    const values: string[] = [];
    for (let n = 0; n < 3; n++) {
      const correction = await returnStockMovement(f.db, { movementId: issue.movement.id, quantity: 1, reason: "Material não consumido devolvido à origem", idempotencyKey: `valued-return-${n}`, actor: f.actor });
      values.push(correction.totalValueDecimal!.toFixed(2));
    }
    assert.deepEqual(values, ["0.03", "0.04", "0.03"]);
    const position = await f.db.materialStockValuation.findUniqueOrThrow({ where: { id: opening.id } });
    assert.equal(position.amount.toFixed(2), "0.10");
    assert.equal(position.quantity.toFixed(6), "3.000000");
    assert.equal(position.version, 4);
    await assert.rejects(f.pg.query('UPDATE "MaterialStockValuation" SET amount=1000 WHERE id=$1', [position.id]), /additive event/);
    await assert.rejects(f.pg.query('UPDATE "MaterialMovement" SET "unitValue"=999 WHERE id=$1', [issue.movement.id]), /immutable/);
    await assert.rejects(f.pg.query('UPDATE "MaterialStock" SET "valuationEnabled"=false WHERE id=$1', ["value-stock"]), /cannot discard/);
  } finally { await f.close(); }
});

test("P6: entradas documentais alteram média; saídas concorrentes não ultrapassam saldo; falha reverte ambos os ledgers", async () => {
  const f = await fixture();
  try {
    await reconcileStockValuation(f.db, f.actor, { ...f.opening, amount: "30.00" });
    await f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 3, unitCost: 30 }));
    const outcomes = await Promise.allSettled([1, 2].map(() => f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "EXIT", quantity: 4, unitCost: 1 }))));
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    const success = outcomes.find(result => result.status === "fulfilled");
    assert.equal(success?.status === "fulfilled" ? success.value.movement.totalValueDecimal?.toFixed(2) : null, "80.00");
    const position = await f.db.materialStockValuation.findUniqueOrThrow({ where: { stockId: "value-stock" } });
    assert.equal(position.quantity.toFixed(6), "2.000000");
    assert.equal(position.amount.toFixed(2), "40.00");
    const count = await f.db.materialStockValuationEvent.count();
    await assert.rejects(f.db.$transaction(async tx => {
      await applyStockMovement(tx, { ...f.input, kind: "EXIT" });
      throw new Error("Falha do produtor após a saída");
    }), /Falha do produtor/);
    assert.equal(await f.db.materialStockValuationEvent.count(), count);
    assert.equal((await f.db.materialStock.findUniqueOrThrow({ where: { id: "value-stock" } })).quantity, 2);
    await assert.rejects(reconcileStockValuation(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, f.opening), /autorizadas/);
    await assert.rejects(f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "ENTRY", sourceType: "HEALTH_RECEIPT" })), /preço documental/);
    for (const quantity of [0.1, 0.2]) await f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "ENTRY", sourceType: "HEALTH_RECEIPT", quantity, unitCost: 20 }));
    assert.equal((await f.db.materialStock.findUniqueOrThrow({ where: { id: "value-stock" } })).quantity, 2.3);
    const fraction = await f.db.$transaction(tx => applyStockMovement(tx, { ...f.input, kind: "EXIT", quantity: 0.3 }));
    assert.equal(fraction.movement.totalValueDecimal?.toFixed(2), "6.00");
    assert.equal((await f.db.materialStockValuation.findUniqueOrThrow({ where: { stockId: "value-stock" } })).amount.toFixed(2), "40.00");
  } finally { await f.close(); }
});

test("P6: consumo reconhece VPD uma vez e retorno recompõe ativo; liquidação sem reconhecimento de estoque bloqueia atomicamente", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await fixture();
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    const appropriation = await f.db.budgetAppropriation.findUniqueOrThrow({ where: { id: f.appropriationId } });
    await f.db.expenseNature.update({ where: { id: appropriation.expenseNatureId }, data: { code: "3.3.90.30" } });
    const date = new Date("2026-09-01T12:00:00Z");
    const reservation = await f.reserve("value-reservation", "30.00", date);
    const commitment = await createCommitment(f.db, f.financeReviewer, { date, number: "VALUE-EMP", value: "30.00", type: "Ordinário", history: "Aquisição de material estocável", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
    const settlement = await createSettlement(f.db, f.financeReviewer, { date, value: "30.00", commitmentId: commitment.id, documentId: "documento-fiscal", documentRef: "Material recebido", authorId: "servidora-ana" });
    await reconcileStockValuation(f.db, f.actor, { ...f.opening, amount: "30.00" });
    const consumption = { ...f.input, kind: "EXIT" as const, settlementId: settlement.id, reason: "CONSUMO_ORCAMENTARIO:Serviço municipal" };
    await assert.rejects(f.db.$transaction(tx => applyStockMovement(tx, consumption)), /reconhecimento Decimal/);
    assert.equal(await f.db.materialMovement.count(), 0);
    assert.equal((await f.db.materialStockValuation.findUniqueOrThrow({ where: { stockId: "value-stock" } })).amount.toFixed(2), "30.00");
    await f.db.accountingPostingRule.update({ where: { id: "rule:LIQUIDACAO_REGISTRADA" }, data: { debitAccountId: "value-asset" } });
    const assetReservation = await f.reserve("value-asset-reservation", "30.00", date);
    const assetCommitment = await createCommitment(f.db, f.financeReviewer, { date, number: "VALUE-ASSET-EMP", value: "30.00", type: "Ordinário", history: "Material reconhecido como ativo", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: assetReservation.id });
    const assetSettlement = await createSettlement(f.db, f.financeReviewer, { date, value: "30.00", commitmentId: assetCommitment.id, documentId: "documento-fiscal", documentRef: "Estoque documentado", authorId: "servidora-ana" });
    await f.db.department.create({ data: { id: "value-department", name: "Destino do consumo", secretariatId: "secretaria" } });
    await f.db.materialRequest.create({ data: { id: "value-request", number: "VALUE-REQUEST", status: "Aprovada", departmentId: "value-department", requesterId: "servidora-ana", items: { create: { id: "value-request-item", materialId: "value-material", quantityRequested: 1, quantityApproved: 1 } } } });
    const delivery = { requestId: "value-request", stockByItem: [{ requestItemId: "value-request-item", stockId: "value-stock", settlementId: assetSettlement.id }] };
    await issueMaterialRequestInFull(f.db, f.actor, delivery);
    const issue = { movement: await f.db.materialMovement.findFirstOrThrow({ where: { materialRequestItemId: "value-request-item" } }) };
    assert.equal(issue.movement.settlementId, assetSettlement.id);
    await assert.rejects(issueMaterialRequestInFull(f.db, f.actor, { ...delivery, stockByItem: [{ ...delivery.stockByItem[0], settlementId: settlement.id }] }), /outra origem/);
    const posted = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "STOCK_CONSUMPTION", sourceId: issue.movement.id }, include: { entries: true } });
    assert.equal(posted.governmentEntityId, "ente");
    assert.equal(posted.budgetUnitId, "ug");
    assert.equal(posted.entries.find(entry => entry.accountId === "value-vpd")?.valueDecimal?.toFixed(2), "10.00");
    const returned = await returnStockMovement(f.db, { movementId: issue.movement.id, quantity: 1, reason: "Consumo cancelado e material devolvido", idempotencyKey: "value-accounting-return", actor: f.actor });
    const reversal = await f.db.accountingTransaction.findFirstOrThrow({ where: { sourceType: "STOCK_CONSUMPTION", sourceId: returned.id }, include: { entries: true } });
    assert.equal(reversal.entries.find(entry => entry.accountId === "value-vpd")?.type, "Crédito");
    assert.equal(reversal.entries.find(entry => entry.accountId === "value-asset")?.type, "Débito");
    await returnStockMovement(f.db, { movementId: issue.movement.id, quantity: 1, reason: "Consumo cancelado e material devolvido", idempotencyKey: "value-accounting-return", actor: f.actor });
    assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "STOCK_CONSUMPTION" } }), 2);
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
