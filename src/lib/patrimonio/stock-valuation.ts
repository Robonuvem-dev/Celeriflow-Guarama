import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { inventorySessions, materialMovements, materialStocks, materialStockValuationEvents, materialStockValuations, warehouses } from "@/db/schema/assets-stock";
import { costCenters } from "@/db/schema/master-data";
import type { MaterialMovementRecord } from "@/lib/contracts/assets-stock";
import { createHash } from "node:crypto";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import type { CostActor } from "@/lib/financeiro/cost-types";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export class StockValuationError extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Tx = DatabaseTransaction;
type ValuationInput = {
  warehouseId: string; materialId: string; batchNumber: string;
  kind: "ENTRY" | "EXIT" | "ADJUSTMENT"; quantity: number; unitCost?: number | null;
  returnedMovementId?: string | null; reversedMovementId?: string | null;
  transferOriginMovementId?: string | null;
  sourceType?: string; actor: { usuarioId: string; allowedBudgetUnitIds?: string[] };
};

export async function lockStockValuation(tx: Tx, input: Pick<ValuationInput, "warehouseId" | "materialId" | "batchNumber">) {
  // The same key protects reconciliation, physical stock and the monetary ledger.
  const key = JSON.stringify(["STOCK_POSITION", input.warehouseId, input.materialId, input.batchNumber]);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function reconcileStockValuation(db: DatabaseConnection, actor: CostActor, input: {
  stockId: string; financialYearId: string; budgetUnitId: string;
  inventoryAccountId: string; consumptionAccountId: string;
  quantity: string; amount: string; documentVersionId: string; reason: string;
}) {
  const quantity = new Decimal(input.quantity), amount = new Decimal(input.amount);
  if (!quantity.isFinite() || quantity.lt(0) || quantity.decimalPlaces() > 6 || quantity.gte("1000000000000") || !amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 || amount.gte("10000000000000000") || (quantity.isZero() && !amount.isZero()) || input.reason.trim().length < 10) throw new StockValuationError("Informe saldo Decimal válido e fundamento da conciliação inicial.");
  return withDatabaseTransaction(db, async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId);
    const [loaded] = await tx.select({ stock: materialStocks, costCenter: costCenters }).from(materialStocks)
      .innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).leftJoin(costCenters, eq(costCenters.id, warehouses.costCenterId)).where(eq(materialStocks.id, input.stockId)).limit(1);
    if (!loaded) throw new StockValuationError("Estoque não encontrado.");
    const { stock, costCenter } = loaded;
    await lockStockValuation(tx, stock);
    const [current] = await tx.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1);
    if (!current) throw new StockValuationError("Estoque não encontrado.");
    if ((await tx.select({ id: inventorySessions.id }).from(inventorySessions).where(and(eq(inventorySessions.warehouseId, stock.warehouseId), inArray(inventorySessions.status, ["COUNTING", "PENDING_APPROVAL"]), eq(inventorySessions.lockMovements, true))).limit(1)).length) throw new StockValuationError("Conclua o inventário físico antes da conciliação monetária.");
    const unit = (await tx.execute<{ secretariatId: string | null }>(sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${input.budgetUnitId}`)).rows[0];
    if (!unit) throw new StockValuationError("Unidade gestora não encontrada.");
    const accounts = (await tx.execute<{ id: string; code: string }>(sql`SELECT id, code FROM "AccountingPlan" WHERE id IN (${input.inventoryAccountId}, ${input.consumptionAccountId})`)).rows;
    if (!accounts.some(account => account.id === input.inventoryAccountId && /^115/.test(account.code.replace(/\D/g, ""))) || !accounts.some(account => account.id === input.consumptionAccountId && /^331/.test(account.code.replace(/\D/g, "")))) throw new StockValuationError("Selecione contas PCASP de estoque (1.1.5) e uso de material de consumo (3.3.1).");
    if (!costCenter || costCenter.governmentEntityId !== year.governmentEntityId || costCenter.secretariatId !== unit.secretariatId) throw new StockValuationError("Almoxarifado e centro devem pertencer à entidade e secretaria da UG conciliada.");
    if (!await authorizedStockActor(tx, actor.usuarioId, input.budgetUnitId)) throw new StockValuationError("Responsável sem vínculo ativo com a UG do estoque.");
    await tx.execute(sql`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`);
    const document = (await tx.execute<{ id: string; documentId: string; status: string; hashSha256: string; documentType: string; personId: string | null; companyId: string | null; documentStatus: string }>(sql`SELECT v.id, v."documentId", v.status, v."hashSha256", d."documentType", d."personId", d."companyId", d.status AS "documentStatus" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${input.documentVersionId}`)).rows[0];
    if (!document || document.documentType !== `ESTOQUE:${year.governmentEntityId}:${input.budgetUnitId}` || document.personId || document.companyId || document.documentStatus !== "Válido" || !["FINAL", "SIGNED"].includes(document.status) || !/^[a-f0-9]{64}$/i.test(document.hashSha256)) throw new StockValuationError("Conciliação exige documento GED de estoque do ente/UG, final/assinado e com hash válido.");
    const evidence = { stockId: stock.id, governmentEntityId: year.governmentEntityId, budgetUnitId: input.budgetUnitId, inventoryAccountId: input.inventoryAccountId, consumptionAccountId: input.consumptionAccountId, quantity: quantity.toFixed(6), amount: amount.toFixed(2), documentId: document.documentId, documentVersionId: document.id, documentHash: document.hashSha256, reason: input.reason.trim() };
    const openingHash = hash(evidence);
    const [prior] = await tx.select().from(materialStockValuations).where(eq(materialStockValuations.stockId, stock.id)).limit(1);
    if (prior) {
      if (prior.openingHash !== openingHash || prior.createdByUsuarioId !== actor.usuarioId) throw new StockValuationError("Posição já conciliada com outra memória; a abertura não pode ser reescrita.");
      return prior;
    }
    if (!quantity.eq(String(current.quantity))) throw new StockValuationError("Quantidade conciliada diverge do saldo físico; recarregue o estoque.");
    const [valuation] = await tx.insert(materialStockValuations).values({ stockId: stock.id, governmentEntityId: year.governmentEntityId!, budgetUnitId: input.budgetUnitId, inventoryAccountId: input.inventoryAccountId, consumptionAccountId: input.consumptionAccountId, quantity, amount, openingQuantity: quantity, openingAmount: amount, openingEvidence: evidence, openingHash, createdByUsuarioId: actor.usuarioId }).returning();
    await tx.update(materialStocks).set({ valuationEnabled: true, unitCost: quantity.isZero() ? 0 : amount.div(quantity).toDecimalPlaces(6).toNumber() }).where(eq(materialStocks.id, stock.id));
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "STOCK_VALUATION_OPENING", targetId: valuation.id });
    return valuation;
  });
}

async function authorizedStockActor(tx: Tx, usuarioId: string, budgetUnitId: string) {
  const result = await tx.execute<{ id: string }>(sql`SELECT u.id FROM "Usuario" u WHERE u.id=${usuarioId} AND u.ativo=true AND EXISTS (SELECT 1 FROM "UsuarioUnidadeGestora" ug WHERE ug."usuarioId"=u.id AND ug."budgetUnitId"=${budgetUnitId}) LIMIT 1`);
  return result.rows.length > 0;
}

/** Called after locking the position and before changing physical stock. */
export async function prepareStockValuation(tx: Tx, input: ValuationInput) {
  const [stock] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, input.warehouseId), eq(materialStocks.materialId, input.materialId), eq(materialStocks.batchNumber, input.batchNumber))).limit(1);
  if (!stock?.valuationEnabled) {
    if (input.transferOriginMovementId) {
      const [origin] = await tx.select({ valuationEnabled: materialStocks.valuationEnabled }).from(materialMovements).leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId)).where(eq(materialMovements.id, input.transferOriginMovementId)).limit(1);
      if (origin?.valuationEnabled) throw new StockValuationError("Concilie a posição de destino antes de receber uma transferência valorizada.");
    }
    return null;
  }
  const [position] = await tx.select().from(materialStockValuations).where(eq(materialStockValuations.stockId, stock.id)).limit(1);
  if (!position) throw new StockValuationError("Estoque habilitado sem abertura conciliada.");
  if (input.actor.allowedBudgetUnitIds && !input.actor.allowedBudgetUnitIds.includes(position.budgetUnitId)) throw new StockValuationError("Estoque valorizado fora das UGs autorizadas.");
  if (position.quantity.toNumber() !== stock.quantity) throw new StockValuationError("Espelho físico diverge do saldo Decimal valorizado; confira os movimentos documentados.");
  if (!await authorizedStockActor(tx, input.actor.usuarioId, position.budgetUnitId)) throw new StockValuationError("Movimentação valorizada exige responsável autorizado na UG do estoque.");
  const quantity = new Decimal(String(input.quantity)).abs();
  if (quantity.decimalPlaces() > 6) throw new StockValuationError("Valorização admite quantidade com até seis casas decimais.");
  const increasing = input.kind === "ENTRY" || input.kind === "ADJUSTMENT" && input.quantity > 0;
  const originMovementId = input.returnedMovementId || input.reversedMovementId || input.transferOriginMovementId || null;
  let amount: Decimal;
  if (originMovementId) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`STOCK_VALUE_ORIGIN:${originMovementId}`}, 0))::text`);
    const [loadedOrigin] = await tx.select({ event: materialStockValuationEvents, materialId: materialMovements.materialId, governmentEntityId: materialStockValuations.governmentEntityId, budgetUnitId: materialStockValuations.budgetUnitId, batchNumber: materialStocks.batchNumber }).from(materialStockValuationEvents)
      .innerJoin(materialMovements, eq(materialMovements.id, materialStockValuationEvents.movementId)).innerJoin(materialStockValuations, eq(materialStockValuations.id, materialStockValuationEvents.valuationId)).innerJoin(materialStocks, eq(materialStocks.id, materialStockValuations.stockId)).where(eq(materialStockValuationEvents.movementId, originMovementId)).limit(1);
    if (!loadedOrigin || loadedOrigin.materialId !== input.materialId || loadedOrigin.governmentEntityId !== position.governmentEntityId || loadedOrigin.budgetUnitId !== position.budgetUnitId || loadedOrigin.batchNumber !== input.batchNumber) throw new StockValuationError("Origem valorizada deve corresponder ao material/lote, ente e UG do movimento.");
    const origin = loadedOrigin.event;
    if (input.transferOriginMovementId) {
      const departure = (await tx.execute<{ destinationWarehouseId: string; status: string; corrected: boolean }>(sql`SELECT t."destinationWarehouseId", t.status, EXISTS (SELECT 1 FROM "MaterialMovement" m WHERE m."reversedMovementId"=${originMovementId} OR m."returnedMovementId"=${originMovementId}) AS corrected FROM "HealthStockTransferItem" i JOIN "HealthStockTransfer" t ON t.id=i."transferId" WHERE i."departureMovementId"=${originMovementId}`)).rows[0];
      if (!departure || departure.destinationWarehouseId !== input.warehouseId || departure.status !== "IN_TRANSIT" || departure.corrected) throw new StockValuationError("Origem deve ser a saída válida da transferência em trânsito destinada ao almoxarifado.");
      if (!increasing || input.sourceType !== "STOCK_TRANSFER_RECEIPT" || origin.quantityDelta.gte(0) || !origin.quantityDelta.abs().eq(quantity)) throw new StockValuationError("Aceite deve conservar integralmente a quantidade e valor da saída de transferência.");
      if ((await tx.select({ id: materialStockValuationEvents.id }).from(materialStockValuationEvents).innerJoin(materialMovements, eq(materialMovements.id, materialStockValuationEvents.movementId)).where(and(eq(materialStockValuationEvents.originMovementId, originMovementId), eq(materialMovements.operation, "REGULAR"))).limit(1)).length) throw new StockValuationError("Saída de transferência já recebida.");
      amount = origin.amountDelta.abs();
    } else {
      if (origin.valuationId !== position.id || increasing === origin.quantityDelta.gt(0)) throw new StockValuationError("Devolução/estorno deve inverter a origem na mesma posição de estoque.");
      const previous = await tx.select().from(materialStockValuationEvents).where(eq(materialStockValuationEvents.originMovementId, originMovementId));
      const previousQuantity = previous.reduce((sum, row) => sum.plus(row.quantityDelta.abs()), new Decimal(0));
      const previousAmount = previous.reduce((sum, row) => sum.plus(row.amountDelta.abs()), new Decimal(0));
      const cumulativeQuantity = previousQuantity.plus(quantity);
      if (cumulativeQuantity.gt(origin.quantityDelta.abs())) throw new StockValuationError("Correção excede a quantidade valorizada original.");
      amount = origin.amountDelta.abs().mul(cumulativeQuantity).div(origin.quantityDelta.abs()).toDecimalPlaces(2).minus(previousAmount);
    }
  } else if (increasing) {
    if (input.sourceType === "STOCK_TRANSFER_RECEIPT") throw new StockValuationError("Transferência valorizada exige vínculo explícito à saída de origem.");
    if (input.unitCost === null || input.unitCost === undefined) throw new StockValuationError("Entrada valorizada exige preço documental; não utiliza o último preço do estoque.");
    const price = new Decimal(String(input.unitCost));
    if (!price.isFinite() || price.lt(0) || price.decimalPlaces() > 6 || price.gte("1000000000000")) throw new StockValuationError("Preço documental deve caber em Decimal de seis casas sem truncamento.");
    amount = quantity.mul(price).toDecimalPlaces(2);
  } else {
    if (quantity.gt(position.quantity) || position.quantity.isZero()) throw new StockValuationError("Saldo valorizado insuficiente.");
    // Last issue takes every remaining cent instead of multiplying a rounded unit cost.
    amount = quantity.eq(position.quantity) ? position.amount : position.amount.mul(quantity).div(position.quantity).toDecimalPlaces(2);
  }
  const quantityDelta = increasing ? quantity : quantity.negated();
  const amountDelta = increasing ? amount : amount.negated();
  const quantityAfter = position.quantity.plus(quantityDelta), amountAfter = position.amount.plus(amountDelta);
  if (amount.lt(0) || quantityAfter.lt(0) || amountAfter.lt(0) || (quantityAfter.isZero() && !amountAfter.isZero())) throw new StockValuationError("Correção produziria saldo monetário/físico inválido; reconcilie os movimentos posteriores.");
  const unitValue = amount.div(quantity).toDecimalPlaces(6);
  return { position, originMovementId, quantityDelta, amountDelta, quantityAfter, amountAfter, amount, unitValue };
}

export async function commitStockValuation(tx: Tx, movement: MaterialMovementRecord, prepared: NonNullable<Awaited<ReturnType<typeof prepareStockValuation>>>) {
  const evidence = { method: prepared.position.method, movementId: movement.id, originMovementId: prepared.originMovementId, openingHash: prepared.position.openingHash, quantityBefore: prepared.position.quantity.toFixed(6), amountBefore: prepared.position.amount.toFixed(2), quantityDelta: prepared.quantityDelta.toFixed(6), amountDelta: prepared.amountDelta.toFixed(2), quantityAfter: prepared.quantityAfter.toFixed(6), amountAfter: prepared.amountAfter.toFixed(2), actorUsuarioId: movement.actorUsuarioId };
  await tx.insert(materialStockValuationEvents).values({ valuationId: prepared.position.id, sequence: prepared.position.version + 1, movementId: movement.id, originMovementId: prepared.originMovementId, quantityDelta: prepared.quantityDelta, amountDelta: prepared.amountDelta, quantityBefore: prepared.position.quantity, amountBefore: prepared.position.amount, quantityAfter: prepared.quantityAfter, amountAfter: prepared.amountAfter, evidence, hash: hash(evidence) });
  await tx.update(materialStockValuations).set({ quantity: prepared.quantityAfter, amount: prepared.amountAfter, version: prepared.position.version + 1 }).where(eq(materialStockValuations.id, prepared.position.id));
  await tx.update(materialStocks).set({ quantity: prepared.quantityAfter.toNumber(), unitCost: prepared.quantityAfter.isZero() ? 0 : prepared.amountAfter.div(prepared.quantityAfter).toDecimalPlaces(6).toNumber() }).where(eq(materialStocks.id, prepared.position.stockId));
}
