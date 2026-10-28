import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { departments } from "../src/db/schema/administration";
import { materialCategories, materialMovements, materials, materialStocks, materialStockValuationEvents, materialStockValuations, warehouses } from "../src/db/schema/assets-stock";
import { materialRequestItems, materialRequests } from "../src/db/schema/assets-requests";
import { accountingEntries, accountingPlans, accountingRules, accountingTransactions } from "../src/db/schema/finance-accounting";
import { costCenters } from "../src/db/schema/master-data";
import { documents } from "../src/db/schema/registry";
import { documentVersions } from "../src/db/schema/document-workflow";
import { planningQuotaEvents, planningQuotas } from "../src/db/schema/planning-budget";
import { createStockAccountingFixture } from "./helpers/stock-accounting-fixture";
import { reconcileStockValuation } from "../src/lib/patrimonio/stock-valuation";
import { applyStockMovement, returnStockMovement } from "../src/lib/patrimonio/stock-service";
import { createCommitment, createSettlement } from "../src/lib/financeiro";
import { issueMaterialRequestInFull } from "../src/lib/compras/procurement-lifecycle";

async function fixture() {
  const f = await createStockAccountingFixture();
  try {
    await f.db.insert(costCenters).values({ id: "value-center", code: "VALUE", name: "Centro conciliado", governmentEntityId: "ente", secretariatId: "secretaria" });
    await f.db.insert(warehouses).values({ id: "value-warehouse", name: "Almoxarifado", costCenterId: "value-center" });
    await f.db.insert(materialCategories).values({ id: "value-class", code: "VALUE", name: "Materiais" });
    await f.db.insert(materials).values({ id: "value-material", code: "VALUE", name: "Material", categoryId: "value-class" });
    await f.db.insert(materialStocks).values({ id: "value-stock", warehouseId: "value-warehouse", materialId: "value-material", quantity: 3, unitCost: 100 });
    await f.db.insert(accountingPlans).values([{ id: "value-asset", code: "1.1.5.6.1", name: "Estoque", type: "Ativo" }, { id: "value-vpd", code: "3.3.1.6.1", name: "Consumo", type: "Despesa" }]);
    await f.db.insert(documents).values({ id: "value-document", title: "Conciliação de estoque", documentType: "ESTOQUE:ente:ug", fileUrl: "/memoria.pdf", status: "Válido" });
    await f.db.insert(documentVersions).values({ id: "value-version", documentId: "value-document", versionNumber: 1, fileUrl: "/memoria.pdf", hashSha256: "a".repeat(64), status: "FINAL" });
    const opening = { stockId: "value-stock", financialYearId: "ano", budgetUnitId: "ug", quantity: "3", amount: "0.10", inventoryAccountId: "value-asset", consumptionAccountId: "value-vpd", documentVersionId: "value-version", reason: "Saldo inicial conciliado conforme documento de estoque" };
    const input = { warehouseId: "value-warehouse", materialId: "value-material", quantity: 1, actor: f.actor };
    const position = async () => (await f.db.select().from(materialStockValuations).where(eq(materialStockValuations.stockId, "value-stock")))[0];
    const stock = async () => (await f.db.select().from(materialStocks).where(eq(materialStocks.id, "value-stock")))[0];
    const valueEventCount = async () => (await f.db.select({ total: count() }).from(materialStockValuationEvents))[0].total;
    const apply = (data: Parameters<typeof applyStockMovement>[1]) => withDatabaseTransaction(f.connection, tx => applyStockMovement(tx, data));
    return { ...f, opening, input, position, stock, valueEventCount, apply };
  } catch (error) { await f.close(); throw error; }
}

test("P6: custo médio conserva centavos no último consumo e nas devoluções parciais; histórico é imutável", async () => {
  const f = await fixture();
  try {
    const opening = await reconcileStockValuation(f.connection, f.actor, f.opening);
    assert.equal((await reconcileStockValuation(f.connection, f.actor, f.opening)).id, opening.id);
    await assert.rejects(reconcileStockValuation(f.connection, f.actor, { ...f.opening, amount: "0.11" }), /já conciliada/);
    const issue = await f.apply({ ...f.input, kind: "EXIT", quantity: 3, unitCost: 100 });
    assert.equal(issue.movement.totalValueDecimal?.toFixed(2), "0.10");
    assert.equal((await f.position()).amount.toFixed(2), "0.00");
    const values: string[] = [];
    for (let n = 0; n < 3; n++) {
      const correction = await returnStockMovement(f.connection, { movementId: issue.movement.id, quantity: 1, reason: "Material não consumido devolvido à origem", idempotencyKey: `valued-return-${n}`, actor: f.actor });
      values.push(correction.totalValueDecimal!.toFixed(2));
    }
    assert.deepEqual(values, ["0.03", "0.04", "0.03"]);
    const position = await f.position();
    assert.equal(position.amount.toFixed(2), "0.10");
    assert.equal(position.quantity.toFixed(6), "3.000000");
    assert.equal(position.version, 4);
    await assert.rejects(f.database.query('UPDATE "MaterialStockValuation" SET amount=1000 WHERE id=$1', [position.id]), /additive event/);
    await assert.rejects(f.database.query('UPDATE "MaterialMovement" SET "unitValue"=999 WHERE id=$1', [issue.movement.id]), /immutable/);
    await assert.rejects(f.database.query('UPDATE "MaterialStock" SET "valuationEnabled"=false WHERE id=$1', ["value-stock"]), /cannot discard/);
  } finally { await f.close(); }
});

test("P6: entradas documentais alteram média; saídas concorrentes não ultrapassam saldo; falha reverte ambos os ledgers", async () => {
  const f = await fixture();
  try {
    await reconcileStockValuation(f.connection, f.actor, { ...f.opening, amount: "30.00" });
    await f.apply({ ...f.input, kind: "ENTRY", sourceType: "APPROVED_PURCHASE_RECEIPT", quantity: 3, unitCost: 30 });
    const outcomes = await Promise.allSettled([1, 2].map(() => f.apply({ ...f.input, kind: "EXIT", quantity: 4, unitCost: 1 })));
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    const success = outcomes.find(result => result.status === "fulfilled");
    assert.equal(success?.status === "fulfilled" ? success.value.movement.totalValueDecimal?.toFixed(2) : null, "80.00");
    const position = await f.position();
    assert.equal(position.quantity.toFixed(6), "2.000000");
    assert.equal(position.amount.toFixed(2), "40.00");
    const count = await f.valueEventCount();
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
      await applyStockMovement(tx, { ...f.input, kind: "EXIT" });
      throw new Error("Falha do produtor após a saída");
    }), /Falha do produtor/);
    assert.equal(await f.valueEventCount(), count);
    assert.equal((await f.stock()).quantity, 2);
    await assert.rejects(reconcileStockValuation(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, f.opening), /autorizadas/);
    await assert.rejects(f.apply({ ...f.input, kind: "ENTRY", sourceType: "HEALTH_RECEIPT" }), /preço documental/);
    for (const quantity of [0.1, 0.2]) await f.apply({ ...f.input, kind: "ENTRY", sourceType: "HEALTH_RECEIPT", quantity, unitCost: 20 });
    assert.equal((await f.stock()).quantity, 2.3);
    const fraction = await f.apply({ ...f.input, kind: "EXIT", quantity: 0.3 });
    assert.equal(fraction.movement.totalValueDecimal?.toFixed(2), "6.00");
    assert.equal((await f.position()).amount.toFixed(2), "40.00");
  } finally { await f.close(); }
});

test("P6: consumo reconhece VPD uma vez e retorno recompõe ativo; liquidação sem reconhecimento de estoque bloqueia atomicamente", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let active: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    const f = active = await fixture();
    const date = new Date("2026-09-01T12:00:00Z");
    const reservation = await f.reserve("value-reservation", "30.00", date);
    const commitment = await createCommitment(f.connection, f.financeReviewer, { date, number: "VALUE-EMP", value: "30.00", type: "Ordinário", history: "Aquisição de material estocável", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
    const settlement = await createSettlement(f.connection, f.financeReviewer, { date, value: "30.00", commitmentId: commitment.id, documentId: "documento-fiscal", documentRef: "Material recebido", authorId: "servidora-ana" });
    assert.equal(settlement.date.toISOString(), date.toISOString());
    await reconcileStockValuation(f.connection, f.actor, { ...f.opening, amount: "30.00" });
    const consumption = { ...f.input, kind: "EXIT" as const, settlementId: settlement.id, reason: "CONSUMO_ORCAMENTARIO:Serviço municipal" };
    await assert.rejects(f.apply(consumption), /reconhecimento Decimal/);
    assert.equal((await f.db.select({ total: count() }).from(materialMovements))[0].total, 0);
    assert.equal((await f.position()).amount.toFixed(2), "30.00");
    await f.db.update(accountingRules).set({ debitAccountId: "value-asset" }).where(eq(accountingRules.id, "rule:LIQUIDACAO_REGISTRADA"));
    const assetReservation = await f.reserve("value-asset-reservation", "30.00", date);
    const assetCommitment = await createCommitment(f.connection, f.financeReviewer, { date, number: "VALUE-ASSET-EMP", value: "30.00", type: "Ordinário", history: "Material reconhecido como ativo", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: assetReservation.id });
    const assetSettlement = await createSettlement(f.connection, f.financeReviewer, { date, value: "30.00", commitmentId: assetCommitment.id, documentId: "documento-fiscal", documentRef: "Estoque documentado", authorId: "servidora-ana" });
    await f.db.insert(departments).values({ id: "value-department", name: "Destino do consumo", secretariatId: "secretaria" });
    await f.db.insert(materialRequests).values({ id: "value-request", number: "VALUE-REQUEST", status: "Aprovada", sourceWarehouseId: "value-warehouse", departmentId: "value-department", requesterId: "servidora-ana" });
    await f.db.insert(materialRequestItems).values({ id: "value-request-item", requestId: "value-request", materialId: "value-material", quantityRequested: 1, quantityApproved: 1 });
    const delivery = { requestId: "value-request", stockByItem: [{ requestItemId: "value-request-item", stockId: "value-stock", settlementId: assetSettlement.id }] };
    await issueMaterialRequestInFull(f.connection, f.actor, delivery);
    const issue = { movement: (await f.db.select().from(materialMovements).where(eq(materialMovements.materialRequestItemId, "value-request-item")))[0] };
    assert.equal(issue.movement.settlementId, assetSettlement.id);
    await assert.rejects(issueMaterialRequestInFull(f.connection, f.actor, { ...delivery, stockByItem: [{ ...delivery.stockByItem[0], settlementId: settlement.id }] }), /outra origem/);
    const [posted] = await f.db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "STOCK_CONSUMPTION"), eq(accountingTransactions.sourceId, issue.movement.id)));
    const postedEntries = await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posted.id));
    assert.equal(posted.governmentEntityId, "ente");
    assert.equal(posted.budgetUnitId, "ug");
    assert.equal(postedEntries.find(entry => entry.accountId === "value-vpd")?.valueDecimal?.toFixed(2), "10.00");
    const returned = await returnStockMovement(f.connection, { movementId: issue.movement.id, quantity: 1, reason: "Consumo cancelado e material devolvido", idempotencyKey: "value-accounting-return", actor: f.actor });
    const [reversal] = await f.db.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "STOCK_CONSUMPTION"), eq(accountingTransactions.sourceId, returned.id)));
    const reversalEntries = await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, reversal.id));
    assert.equal(reversalEntries.find(entry => entry.accountId === "value-vpd")?.type, "Crédito");
    assert.equal(reversalEntries.find(entry => entry.accountId === "value-asset")?.type, "Débito");
    await returnStockMovement(f.connection, { movementId: issue.movement.id, quantity: 1, reason: "Consumo cancelado e material devolvido", idempotencyKey: "value-accounting-return", actor: f.actor });
    assert.equal((await f.db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceType, "STOCK_CONSUMPTION")))[0].total, 2);
    const quotas = await f.db.select().from(planningQuotas).where(eq(planningQuotas.lineId, "stock-expense-line"));
    assert.equal(quotas.find(quota => quota.month === 9)?.consumed.toFixed(2), "60.00");
    assert.equal(quotas.find(quota => quota.month === 9)?.planned.toFixed(2), "60.00");
    assert.equal(quotas.find(quota => quota.month === 10)?.planned.toFixed(2), "40.00");
    assert.equal(quotas.reduce((sum, quota) => sum.plus(quota.planned), new Decimal(0)).toFixed(2), "600.00");
    const periodTransfers = await f.db.select().from(planningQuotaEvents).where(inArray(planningQuotaEvents.type, ["PERIOD_TRANSFER_IN", "PERIOD_TRANSFER_OUT"]));
    assert.equal(periodTransfers.length, 2);
    assert.equal(periodTransfers.find(event => event.type === "PERIOD_TRANSFER_IN")?.value.toFixed(2), "10.00");
    assert.equal(periodTransfers.find(event => event.type === "PERIOD_TRANSFER_OUT")?.value.toFixed(2), "-10.00");
    assert.equal((await f.db.select({ total: count() }).from(planningQuotaEvents).where(eq(planningQuotaEvents.type, "CONSUME")))[0].total, 2);
    assert.equal((await f.position()).amount.toFixed(2), "30.00");
  } finally {
    await active?.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
