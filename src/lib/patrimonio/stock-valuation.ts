import { Prisma, type PrismaClient, type MaterialMovement } from "@prisma/client";
import { createHash } from "node:crypto";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import type { CostActor } from "@/lib/financeiro/cost-types";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export class StockValuationError extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Tx = Prisma.TransactionClient;
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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function reconcileStockValuation(db: PrismaClient, actor: CostActor, input: {
  stockId: string; financialYearId: string; budgetUnitId: string;
  inventoryAccountId: string; consumptionAccountId: string;
  quantity: string; amount: string; documentVersionId: string; reason: string;
}) {
  const quantity = new Prisma.Decimal(input.quantity), amount = new Prisma.Decimal(input.amount);
  if (!quantity.isFinite() || quantity.lt(0) || quantity.decimalPlaces() > 6 || quantity.gte("1000000000000") || !amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 || amount.gte("10000000000000000") || (quantity.isZero() && !amount.isZero()) || input.reason.trim().length < 10) throw new StockValuationError("Informe saldo Decimal válido e fundamento da conciliação inicial.");
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId);
    const stock = await tx.materialStock.findUniqueOrThrow({ where: { id: input.stockId }, include: { warehouse: { include: { costCenter: true } } } });
    await lockStockValuation(tx, stock);
    const current = await tx.materialStock.findUniqueOrThrow({ where: { id: stock.id } });
    if (await tx.inventorySession.count({ where: { warehouseId: stock.warehouseId, status: { in: ["COUNTING", "PENDING_APPROVAL"] }, lockMovements: true } })) throw new StockValuationError("Conclua o inventário físico antes da conciliação monetária.");
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } });
    const accounts = await tx.accountingPlan.findMany({ where: { id: { in: [input.inventoryAccountId, input.consumptionAccountId] } } });
    if (!accounts.some(account => account.id === input.inventoryAccountId && /^115/.test(account.code.replace(/\D/g, ""))) || !accounts.some(account => account.id === input.consumptionAccountId && /^331/.test(account.code.replace(/\D/g, "")))) throw new StockValuationError("Selecione contas PCASP de estoque (1.1.5) e uso de material de consumo (3.3.1).");
    if (!stock.warehouse.costCenter || stock.warehouse.costCenter.governmentEntityId !== year.governmentEntityId || stock.warehouse.costCenter.secretariatId !== unit.secretariatId) throw new StockValuationError("Almoxarifado e centro devem pertencer à entidade e secretaria da UG conciliada.");
    if (!await tx.usuario.count({ where: { id: actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: input.budgetUnitId } } } })) throw new StockValuationError("Responsável sem vínculo ativo com a UG do estoque.");
    await tx.$queryRaw`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`;
    const document = await tx.documentVersion.findUnique({ where: { id: input.documentVersionId }, include: { document: true } });
    if (!document || document.document.documentType !== `ESTOQUE:${year.governmentEntityId}:${input.budgetUnitId}` || document.document.personId || document.document.companyId || document.document.status !== "Válido" || !["FINAL", "SIGNED"].includes(document.status) || !/^[a-f0-9]{64}$/i.test(document.hashSha256)) throw new StockValuationError("Conciliação exige documento GED de estoque do ente/UG, final/assinado e com hash válido.");
    const evidence = { stockId: stock.id, governmentEntityId: year.governmentEntityId, budgetUnitId: input.budgetUnitId, inventoryAccountId: input.inventoryAccountId, consumptionAccountId: input.consumptionAccountId, quantity: quantity.toFixed(6), amount: amount.toFixed(2), documentId: document.documentId, documentVersionId: document.id, documentHash: document.hashSha256, reason: input.reason.trim() };
    const openingHash = hash(evidence);
    const prior = await tx.materialStockValuation.findUnique({ where: { stockId: stock.id } });
    if (prior) {
      if (prior.openingHash !== openingHash || prior.createdByUsuarioId !== actor.usuarioId) throw new StockValuationError("Posição já conciliada com outra memória; a abertura não pode ser reescrita.");
      return prior;
    }
    if (!quantity.eq(String(current.quantity))) throw new StockValuationError("Quantidade conciliada diverge do saldo físico; recarregue o estoque.");
    const valuation = await tx.materialStockValuation.create({ data: { stockId: stock.id, governmentEntityId: year.governmentEntityId!, budgetUnitId: input.budgetUnitId, inventoryAccountId: input.inventoryAccountId, consumptionAccountId: input.consumptionAccountId, quantity, amount, openingQuantity: quantity, openingAmount: amount, openingEvidence: evidence, openingHash, createdByUsuarioId: actor.usuarioId } });
    await tx.materialStock.update({ where: { id: stock.id }, data: { valuationEnabled: true, unitCost: quantity.isZero() ? 0 : amount.div(quantity).toDecimalPlaces(6).toNumber() } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "STOCK_VALUATION_OPENING", targetId: valuation.id });
    return valuation;
  });
}

/** Called after locking the position and before changing physical stock. */
export async function prepareStockValuation(tx: Tx, input: ValuationInput) {
  const stock = await tx.materialStock.findUnique({ where: { warehouseId_materialId_batchNumber: { warehouseId: input.warehouseId, materialId: input.materialId, batchNumber: input.batchNumber } } });
  if (!stock?.valuationEnabled) {
    if (input.transferOriginMovementId) {
      const origin = await tx.materialMovement.findUnique({ where: { id: input.transferOriginMovementId }, include: { stock: true } });
      if (origin?.stock?.valuationEnabled) throw new StockValuationError("Concilie a posição de destino antes de receber uma transferência valorizada.");
    }
    return null;
  }
  const position = await tx.materialStockValuation.findUnique({ where: { stockId: stock.id } });
  if (!position) throw new StockValuationError("Estoque habilitado sem abertura conciliada.");
  if (input.actor.allowedBudgetUnitIds && !input.actor.allowedBudgetUnitIds.includes(position.budgetUnitId)) throw new StockValuationError("Estoque valorizado fora das UGs autorizadas.");
  if (position.quantity.toNumber() !== stock.quantity) throw new StockValuationError("Espelho físico diverge do saldo Decimal valorizado; confira os movimentos documentados.");
  if (!await tx.usuario.count({ where: { id: input.actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: position.budgetUnitId } } } })) throw new StockValuationError("Movimentação valorizada exige responsável autorizado na UG do estoque.");
  const quantity = new Prisma.Decimal(String(input.quantity)).abs();
  if (quantity.decimalPlaces() > 6) throw new StockValuationError("Valorização admite quantidade com até seis casas decimais.");
  const increasing = input.kind === "ENTRY" || input.kind === "ADJUSTMENT" && input.quantity > 0;
  const originMovementId = input.returnedMovementId || input.reversedMovementId || input.transferOriginMovementId || null;
  let amount: Prisma.Decimal;
  if (originMovementId) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`STOCK_VALUE_ORIGIN:${originMovementId}`}, 0))::text`;
    const origin = await tx.materialStockValuationEvent.findUnique({ where: { movementId: originMovementId }, include: { movement: true, valuation: { include: { stock: true } } } });
    if (!origin || origin.movement.materialId !== input.materialId || origin.valuation.governmentEntityId !== position.governmentEntityId || origin.valuation.budgetUnitId !== position.budgetUnitId || origin.valuation.stock.batchNumber !== input.batchNumber) throw new StockValuationError("Origem valorizada deve corresponder ao material/lote, ente e UG do movimento.");
    if (input.transferOriginMovementId) {
      const departure = await tx.healthStockTransferItem.findUnique({ where: { departureMovementId: originMovementId }, include: { transfer: true } });
      if (!departure || departure.transfer.destinationWarehouseId !== input.warehouseId || departure.transfer.status !== "IN_TRANSIT" || await tx.materialMovement.count({ where: { OR: [{ reversedMovementId: originMovementId }, { returnedMovementId: originMovementId }] } })) throw new StockValuationError("Origem deve ser a saída válida da transferência em trânsito destinada ao almoxarifado.");
      if (!increasing || input.sourceType !== "STOCK_TRANSFER_RECEIPT" || origin.quantityDelta.gte(0) || !origin.quantityDelta.abs().eq(quantity)) throw new StockValuationError("Aceite deve conservar integralmente a quantidade e valor da saída de transferência.");
      if (await tx.materialStockValuationEvent.count({ where: { originMovementId, movement: { operation: "REGULAR" } } })) throw new StockValuationError("Saída de transferência já recebida.");
      amount = origin.amountDelta.abs();
    } else {
      if (origin.valuationId !== position.id || increasing === origin.quantityDelta.gt(0)) throw new StockValuationError("Devolução/estorno deve inverter a origem na mesma posição de estoque.");
      const previous = await tx.materialStockValuationEvent.findMany({ where: { originMovementId } });
      const previousQuantity = previous.reduce((sum, row) => sum.plus(row.quantityDelta.abs()), new Prisma.Decimal(0));
      const previousAmount = previous.reduce((sum, row) => sum.plus(row.amountDelta.abs()), new Prisma.Decimal(0));
      const cumulativeQuantity = previousQuantity.plus(quantity);
      if (cumulativeQuantity.gt(origin.quantityDelta.abs())) throw new StockValuationError("Correção excede a quantidade valorizada original.");
      amount = origin.amountDelta.abs().mul(cumulativeQuantity).div(origin.quantityDelta.abs()).toDecimalPlaces(2).minus(previousAmount);
    }
  } else if (increasing) {
    if (input.sourceType === "STOCK_TRANSFER_RECEIPT") throw new StockValuationError("Transferência valorizada exige vínculo explícito à saída de origem.");
    if (input.unitCost === null || input.unitCost === undefined) throw new StockValuationError("Entrada valorizada exige preço documental; não utiliza o último preço do estoque.");
    const price = new Prisma.Decimal(String(input.unitCost));
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

export async function commitStockValuation(tx: Tx, movement: MaterialMovement, prepared: NonNullable<Awaited<ReturnType<typeof prepareStockValuation>>>) {
  const evidence = { method: prepared.position.method, movementId: movement.id, originMovementId: prepared.originMovementId, openingHash: prepared.position.openingHash, quantityBefore: prepared.position.quantity.toFixed(6), amountBefore: prepared.position.amount.toFixed(2), quantityDelta: prepared.quantityDelta.toFixed(6), amountDelta: prepared.amountDelta.toFixed(2), quantityAfter: prepared.quantityAfter.toFixed(6), amountAfter: prepared.amountAfter.toFixed(2), actorUsuarioId: movement.actorUsuarioId };
  await tx.materialStockValuationEvent.create({ data: { valuationId: prepared.position.id, sequence: prepared.position.version + 1, movementId: movement.id, originMovementId: prepared.originMovementId, quantityDelta: prepared.quantityDelta, amountDelta: prepared.amountDelta, quantityBefore: prepared.position.quantity, amountBefore: prepared.position.amount, quantityAfter: prepared.quantityAfter, amountAfter: prepared.amountAfter, evidence, hash: hash(evidence) } });
  await tx.materialStockValuation.update({ where: { id: prepared.position.id }, data: { quantity: prepared.quantityAfter, amount: prepared.amountAfter, version: prepared.position.version + 1 } });
  await tx.materialStock.update({ where: { id: prepared.position.stockId }, data: { quantity: prepared.quantityAfter.toNumber(), unitCost: prepared.quantityAfter.isZero() ? 0 : prepared.amountAfter.div(prepared.quantityAfter).toDecimalPlaces(6).toNumber() } });
}
