import { Prisma, type PrismaClient } from "@prisma/client";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { recordStockMunicipalCosts, reduceStockMunicipalCosts } from "@/lib/financeiro/cost-stock-bridge";
import { lockStockValuation, prepareStockValuation, commitStockValuation } from "./stock-valuation";
import { postStockConsumptionAccounting } from "./stock-consumption-accounting";

export class StockServiceError extends Error {}

export type StockMovementKind = "ENTRY" | "EXIT" | "ADJUSTMENT";

export type StockActor = {
  usuarioId: string;
  employeeId?: string | null;
  allowedBudgetUnitIds?: string[];
};

export type StockMovementInput = {
  kind: StockMovementKind;
  warehouseId: string;
  materialId: string;
  quantity: number;
  batchNumber?: string | null;
  expirationDate?: Date | null;
  unitCost?: number | null;
  reason?: string | null;
  supplierId?: string | null;
  departmentId?: string | null;
  obrasServicoId?: string | null;
  /** Optional financial proof of delivery. Never required for Obras service issues. */
  settlementId?: string | null;
  /** Reserved for the approved inventory-close workflow. */
  inventorySessionId?: string | null;
  /** Stock entries are reserved for a receipt already approved by procurement. */
  sourceType?: "APPROVED_PURCHASE_RECEIPT" | "MATERIAL_REQUEST_ISSUE" | "ASSET_ACQUISITION" | "HEALTH_RECEIPT" | "STOCK_TRANSFER_RECEIPT" | "STOCK_RETURN" | "STOCK_REVERSAL";
  materialRequestItemId?: string | null;
  operation?: "REGULAR" | "RETURN" | "REVERSAL";
  idempotencyKey?: string | null;
  returnedMovementId?: string | null;
  reversedMovementId?: string | null;
  /** Explicit departure proof for valued transfers; never inferred from reason text. */
  transferOriginMovementId?: string | null;
  actor: StockActor;
};

export type ReturnStockMovementInput = {
  movementId: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  actor: StockActor;
};

export type ReverseStockMovementInput = {
  movementId: string;
  reason: string;
  idempotencyKey: string;
  actor: StockActor;
};

type ValidStockMovementInput = StockMovementInput & { batchNumber: string };

function required(value: string, label: string) {
  if (!value.trim()) throw new StockServiceError(`${label} é obrigatório.`);
  return value.trim();
}

export function normalizeStockMovement(input: StockMovementInput): ValidStockMovementInput {
  const warehouseId = required(input.warehouseId, "Almoxarifado");
  const materialId = required(input.materialId, "Material");
  const batchNumber = input.batchNumber?.trim() ?? "";
  const actorUsuarioId = required(input.actor.usuarioId, "Usuário responsável");

  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new StockServiceError("Informe uma quantidade diferente de zero.");
  }
  if (input.kind !== "ENTRY" && input.kind !== "EXIT" && input.kind !== "ADJUSTMENT") {
    throw new StockServiceError("Tipo de movimentação inválido.");
  }
  if ((input.kind === "ENTRY" || input.kind === "EXIT") && input.quantity < 0) {
    throw new StockServiceError("Entrada e saída devem informar quantidade positiva.");
  }
  if (input.kind === "ENTRY" && !["APPROVED_PURCHASE_RECEIPT", "HEALTH_RECEIPT", "STOCK_TRANSFER_RECEIPT", "STOCK_RETURN", "STOCK_REVERSAL"].includes(input.sourceType || "")) {
    throw new StockServiceError("Entradas de estoque exigem recebimento aprovado ou aceite de transferência.");
  }
  if (input.sourceType === "MATERIAL_REQUEST_ISSUE" && input.kind !== "EXIT") {
    throw new StockServiceError("A requisição de material pode originar somente uma saída de estoque.");
  }
  if (input.sourceType === "ASSET_ACQUISITION" && input.kind !== "EXIT") {
    throw new StockServiceError("O tombamento patrimonial pode originar somente uma saída de estoque.");
  }
  if (input.unitCost !== undefined && input.unitCost !== null && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
    throw new StockServiceError("O custo unitário deve ser maior ou igual a zero.");
  }
  if (input.expirationDate && Number.isNaN(input.expirationDate.valueOf())) {
    throw new StockServiceError("Data de validade inválida.");
  }
  if (input.settlementId?.trim() && input.kind !== "EXIT") {
    throw new StockServiceError("A liquidação pode ser vinculada somente a uma saída de estoque.");
  }
  const consumptionReason = input.reason?.trim().split(":")[0];
  if (input.kind === "EXIT" && (consumptionReason === "CONSUMO_ORCAMENTARIO" || consumptionReason === "CONSUMO_ORCAMENTARIO_DIRETO")) {
    if (!input.settlementId?.trim()) {
      throw new StockServiceError("Saída de estoque por consumo orçamentário exige o vínculo de uma liquidação ativa.");
    }
  }

  if ((input.operation === "RETURN" || input.sourceType === "STOCK_RETURN") && (input.operation !== "RETURN" || !input.returnedMovementId?.trim() || input.kind !== "ENTRY" || input.sourceType !== "STOCK_RETURN")) {
    throw new StockServiceError("A devolução deve referenciar uma saída de estoque.");
  }
  if ((input.operation === "REVERSAL" || input.sourceType === "STOCK_REVERSAL") && (input.operation !== "REVERSAL" || !input.reversedMovementId?.trim() || input.sourceType !== "STOCK_REVERSAL")) {
    throw new StockServiceError("O estorno deve referenciar o movimento original.");
  }

  return {
    ...input,
    warehouseId,
    materialId,
    batchNumber,
    operation: input.operation ?? "REGULAR",
    idempotencyKey: input.idempotencyKey?.trim() || null,
    returnedMovementId: input.returnedMovementId?.trim() || null,
    reversedMovementId: input.reversedMovementId?.trim() || null,
    actor: { ...input.actor, usuarioId: actorUsuarioId },
  };
}

function updateMetadata(input: ValidStockMovementInput) {
  return {
    ...(input.expirationDate !== undefined ? { expirationDate: input.expirationDate } : {}),
    ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
  };
}

async function ensureStockTarget(tx: Prisma.TransactionClient, input: ValidStockMovementInput) {
  // Financial origin precedes the position lock in every native consumer.
  if (input.settlementId?.trim()) await tx.$executeRaw`SELECT id FROM "Settlement" WHERE id=${input.settlementId.trim()} FOR UPDATE`;
  const [warehouse, material, settlement] = await Promise.all([
    tx.warehouse.findFirst({ where: { id: input.warehouseId, isActive: true }, select: { id: true } }),
    tx.material.findUnique({ where: { id: input.materialId }, select: { id: true, isActive: true } }),
    input.settlementId?.trim()
      ? tx.settlement.findFirst({ where: { id: input.settlementId.trim(), status: "Liquidado" }, select: { id: true } })
      : null,
  ]);
  if (!warehouse) throw new StockServiceError("Almoxarifado não encontrado ou inativo.");
  const continuingLifecycle = ["APPROVED_PURCHASE_RECEIPT", "MATERIAL_REQUEST_ISSUE", "ASSET_ACQUISITION", "HEALTH_RECEIPT", "STOCK_TRANSFER_RECEIPT", "STOCK_RETURN", "STOCK_REVERSAL"].includes(input.sourceType || "")
    || (input.kind === "ADJUSTMENT" && Boolean(input.inventorySessionId?.trim()));
  if (!material || (material.isActive === false && !continuingLifecycle)) throw new StockServiceError("Material não encontrado ou inativo.");
  if (input.settlementId?.trim() && !settlement) throw new StockServiceError("Liquidação não encontrada ou não está ativa.");
}

async function ensureWarehouseIsNotCounting(tx: Prisma.TransactionClient, input: ValidStockMovementInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${input.warehouseId}`}))`;
  const lockedSession = await tx.inventorySession.findFirst({
    where: {
      warehouseId: input.warehouseId,
      lockMovements: true,
      status: { in: ["COUNTING", "PENDING_APPROVAL"] },
    },
    select: { id: true },
  });
  if (lockedSession && (input.inventorySessionId !== lockedSession.id || input.kind !== "ADJUSTMENT")) {
    throw new StockServiceError("Movimentações estão bloqueadas enquanto o inventário deste almoxarifado está em andamento.");
  }
}

async function increaseStock(tx: Prisma.TransactionClient, input: ValidStockMovementInput, quantity: number) {
  return tx.materialStock.upsert({
    where: {
      warehouseId_materialId_batchNumber: {
        warehouseId: input.warehouseId,
        materialId: input.materialId,
        batchNumber: input.batchNumber,
      },
    },
    create: {
      warehouseId: input.warehouseId,
      materialId: input.materialId,
      batchNumber: input.batchNumber,
      quantity,
      expirationDate: input.expirationDate ?? null,
      unitCost: input.unitCost ?? null,
    },
    update: {
      quantity: { increment: quantity },
      ...updateMetadata(input),
    },
    select: { id: true, unitCost: true },
  });
}

async function decreaseStock(tx: Prisma.TransactionClient, input: ValidStockMovementInput, quantity: number) {
  const stock = await tx.materialStock.findUnique({
    where: {
      warehouseId_materialId_batchNumber: {
        warehouseId: input.warehouseId,
        materialId: input.materialId,
        batchNumber: input.batchNumber,
      },
    },
    select: { id: true, unitCost: true },
  });
  if (!stock) throw new StockServiceError("Estoque não encontrado para o lote informado.");

  const updated = await tx.materialStock.updateMany({
    where: { id: stock.id, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (updated.count !== 1) throw new StockServiceError("Estoque insuficiente para atender a solicitação.");
  return stock;
}

/** Applies a movement inside an existing transaction so callers can add domain records atomically. */
export async function applyStockMovement(tx: Prisma.TransactionClient, rawInput: StockMovementInput) {
  const input = normalizeStockMovement(rawInput);
  await ensureStockTarget(tx, input);
  await ensureWarehouseIsNotCounting(tx, input);
  await lockStockValuation(tx, input);
  const valuation = await prepareStockValuation(tx, input);

  const stock = input.kind === "ENTRY" || (input.kind === "ADJUSTMENT" && input.quantity > 0)
    ? await increaseStock(tx, input, input.quantity)
    : await decreaseStock(tx, input, Math.abs(input.quantity));

  const type = input.kind === "ENTRY" ? "Entrada" : input.kind === "EXIT" ? "Saída" : "Ajuste";
  const quantity = new Prisma.Decimal(String(input.quantity));
  const unitValue = valuation ? valuation.unitValue.toNumber() : input.unitCost ?? stock.unitCost;
  const price = valuation?.unitValue ?? (unitValue !== null && unitValue !== undefined ? new Prisma.Decimal(String(unitValue)) : null);
  const decimalQuantity = quantity.decimalPlaces() <= 6 && quantity.abs().lt("1000000000000") ? quantity : null;
  const decimalPrice = price?.isFinite() && price.gte(0) && price.decimalPlaces() <= 6 && price.lt("1000000000000") ? price : null;
  const total = valuation?.amount ?? (decimalQuantity && decimalPrice ? decimalQuantity.abs().mul(decimalPrice).toDecimalPlaces(2) : null);
  if (valuation && (!decimalQuantity || !decimalPrice || !total || total.gte("10000000000000000"))) throw new StockServiceError("Quantidade/preço/total valorizados devem caber na memória Decimal sem truncamento.");
  const movement = await tx.materialMovement.create({
    data: {
      type,
      quantity: input.quantity,
      unitValue,
      quantityDecimal: decimalQuantity,
      unitValueDecimal: decimalPrice,
      totalValueDecimal: total?.lt("10000000000000000") ? total : null,
      reason: input.reason?.trim() || null,
      warehouseId: input.warehouseId,
      materialId: input.materialId,
      stockId: stock.id,
      supplierId: input.supplierId?.trim() || null,
      departmentId: input.departmentId?.trim() || null,
      obrasServicoId: input.obrasServicoId?.trim() || null,
      settlementId: input.settlementId?.trim() || null,
      inventorySessionId: input.inventorySessionId?.trim() || null,
      materialRequestItemId: input.materialRequestItemId?.trim() || null,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      returnedMovementId: input.returnedMovementId,
      reversedMovementId: input.reversedMovementId,
      actorUsuarioId: input.actor.usuarioId,
      actorEmployeeId: input.actor.employeeId ?? null,
    },
  });
  if (valuation) await commitStockValuation(tx, movement, valuation);
  if (valuation) await postStockConsumptionAccounting(tx, input.actor, movement);
  await recordStockMunicipalCosts(tx, input.actor, movement);
  return { stock, movement };
}

export async function recordStockMovement(db: PrismaClient, input: StockMovementInput) {
  return db.$transaction(async (tx) => {
    const result = await applyStockMovement(tx, input);
    if (input.kind === "ADJUSTMENT" && !input.inventorySessionId?.trim()) {
      await writeAuditEvent(tx, {
        actorUsuarioId: input.actor.usuarioId,
        eventType: auditEventTypes.stockManuallyAdjusted,
        targetType: "MATERIAL_MOVEMENT",
        targetId: result.movement.id,
      });
    }
    return result;
  });
}

export async function returnStockMovement(db: PrismaClient, rawInput: ReturnStockMovementInput) {
  const movementId = required(rawInput.movementId, "Movimento de saída");
  const reason = required(rawInput.reason, "Motivo da devolução");
  const idempotencyKey = required(rawInput.idempotencyKey, "Chave de idempotência");
  if (!Number.isFinite(rawInput.quantity) || rawInput.quantity <= 0) {
    throw new StockServiceError("A quantidade devolvida deve ser maior que zero.");
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`MATERIAL_MOVEMENT:${movementId}`}))`;
    const existing = await tx.materialMovement.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.operation !== "RETURN" || existing.returnedMovementId !== movementId || existing.quantity !== rawInput.quantity || existing.reason !== reason || existing.actorUsuarioId !== rawInput.actor.usuarioId) throw new StockServiceError("Chave já utilizada para outra devolução de material.");
      return existing;
    }

    const original = await tx.materialMovement.findUnique({
      where: { id: movementId },
      include: { stock: { select: { batchNumber: true } }, reversalMovement: { select: { id: true } } },
    });
    if (!original || original.type !== "Saída" || original.operation !== "REGULAR") {
      throw new StockServiceError("Somente uma saída regular pode receber devolução.");
    }
    if (!original.stock) throw new StockServiceError("A saída não possui posição de estoque vinculada.");
    if (original.reversalMovement) throw new StockServiceError("Não é possível devolver uma saída já estornada.");

    const returned = await tx.materialMovement.aggregate({
      where: { returnedMovementId: original.id, operation: "RETURN" },
      _sum: { quantity: true },
    });
    let returnedQuantity = new Prisma.Decimal(String(returned._sum.quantity ?? 0));
    if (original.quantityDecimal) {
      const returns = await tx.materialMovement.findMany({ where: { returnedMovementId: original.id, operation: "RETURN" }, select: { quantityDecimal: true } });
      if (returns.some(row => !row.quantityDecimal)) throw new StockServiceError("Devoluções anteriores sem quantidade Decimal exigem conciliação.");
      returnedQuantity = returns.reduce((sum, row) => sum.plus(row.quantityDecimal!), new Prisma.Decimal(0));
    }
    if (returnedQuantity.plus(String(rawInput.quantity)).gt(original.quantityDecimal ?? String(original.quantity))) {
      throw new StockServiceError("A devolução excede a quantidade da saída original.");
    }

    const result = await applyStockMovement(tx, {
      kind: "ENTRY",
      sourceType: "STOCK_RETURN",
      operation: "RETURN",
      idempotencyKey,
      returnedMovementId: original.id,
      warehouseId: original.warehouseId,
      materialId: original.materialId,
      batchNumber: original.stock.batchNumber,
      quantity: rawInput.quantity,
      unitCost: original.unitValue,
      departmentId: original.departmentId,
      reason,
      actor: rawInput.actor,
    });
    await reduceStockMunicipalCosts(tx, rawInput.actor, original, result.movement);
    await writeAuditEvent(tx, {
      actorUsuarioId: rawInput.actor.usuarioId,
      eventType: auditEventTypes.stockReturned,
      targetType: "MATERIAL_MOVEMENT",
      targetId: result.movement.id,
    });
    return result.movement;
  });
}

export async function reverseStockMovement(db: PrismaClient, rawInput: ReverseStockMovementInput) {
  return db.$transaction(tx => reverseStockMovementInTransaction(tx, rawInput));
}

export async function reverseStockMovementInTransaction(tx: Prisma.TransactionClient, rawInput: ReverseStockMovementInput) {
  const movementId = required(rawInput.movementId, "Movimento original");
  const reason = required(rawInput.reason, "Motivo do estorno");
  const idempotencyKey = required(rawInput.idempotencyKey, "Chave de idempotência");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`MATERIAL_MOVEMENT:${movementId}`}))`;
  const existing = await tx.materialMovement.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.operation !== "REVERSAL" || existing.reversedMovementId !== movementId || existing.reason !== reason || existing.actorUsuarioId !== rawInput.actor.usuarioId) throw new StockServiceError("Chave já utilizada para outro estorno de material.");
    return existing;
  }

  const original = await tx.materialMovement.findUnique({
    where: { id: movementId },
    include: {
      stock: { select: { batchNumber: true } },
      reversalMovement: { select: { id: true } },
      returnMovements: { where: { operation: "RETURN" }, select: { id: true }, take: 1 },
    },
  });
  if (!original || !["Entrada", "Saída"].includes(original.type) || original.operation !== "REGULAR") {
    throw new StockServiceError("Somente uma entrada ou saída regular pode ser estornada.");
  }
  if (!original.stock) throw new StockServiceError("O movimento não possui posição de estoque vinculada.");
  if (original.reversalMovement) throw new StockServiceError("O movimento já foi estornado.");
  if (original.returnMovements.length) throw new StockServiceError("Uma saída com devolução não pode ser estornada integralmente.");
  if (["TRANSFERENCIA_EM_TRANSITO", "ACEITE_TRANSFERENCIA"].includes(original.reason?.split(":")[0] ?? "")) throw new StockServiceError("Movimento de transferência exige tratamento do documento de transferência; não pode ser estornado isoladamente.");

  const result = await applyStockMovement(tx, {
    kind: original.type === "Entrada" ? "EXIT" : "ENTRY",
    sourceType: "STOCK_REVERSAL",
    operation: "REVERSAL",
    idempotencyKey,
    reversedMovementId: original.id,
    warehouseId: original.warehouseId,
    materialId: original.materialId,
    batchNumber: original.stock.batchNumber,
    quantity: Math.abs(original.quantity),
    unitCost: original.unitValue,
    departmentId: original.departmentId,
    reason,
    actor: rawInput.actor,
  });
  await reduceStockMunicipalCosts(tx, rawInput.actor, original, result.movement);
  await writeAuditEvent(tx, {
    actorUsuarioId: rawInput.actor.usuarioId,
    eventType: auditEventTypes.stockMovementReversed,
    targetType: "MATERIAL_MOVEMENT",
    targetId: result.movement.id,
  });
  return result.movement;
}
