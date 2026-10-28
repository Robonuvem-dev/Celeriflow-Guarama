import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { inventorySessions, inventorySessionItems, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { applyStockMovement, type StockActor } from "./stock-service";

export class InventoryServiceError extends Error {}

const OPEN_STATUSES = ["COUNTING", "PENDING_APPROVAL"];
const DIVERGENCE_TYPES = new Set([
  "SEM_DIVERGENCIA",
  "SOBRA",
  "FALTA",
  "VENCIDO",
  "DANIFICADO",
  "DESCARTE",
  "VENCIMENTO",
  "ITEM_INESPERADO",
  "AJUSTE_INVENTARIO",
  "LOTE_DIVERGENTE",
  "VALIDADE_DIVERGENTE",
]);

type InventoryActor = StockActor;

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new InventoryServiceError(`${label} é obrigatório.`);
  return normalized;
}

function validCountedQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new InventoryServiceError("A quantidade contada deve ser maior ou igual a zero.");
  }
  return quantity;
}

export async function createInventorySession(db: DatabaseConnection, input: { warehouseId: string; actor: InventoryActor }) {
  const warehouseId = required(input.warehouseId, "Almoxarifado");
  const createdByUsuarioId = required(input.actor.usuarioId, "Usuário responsável");

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${warehouseId}`}))`);
    const [warehouse] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.isActive, true))).limit(1);
    if (!warehouse) throw new InventoryServiceError("Almoxarifado não encontrado ou inativo.");

    const [openSession] = await tx.select({ id: inventorySessions.id }).from(inventorySessions).where(and(eq(inventorySessions.warehouseId, warehouseId), eq(inventorySessions.lockMovements, true), inArray(inventorySessions.status, OPEN_STATUSES))).limit(1);
    if (openSession) throw new InventoryServiceError("Já existe um inventário em andamento para este almoxarifado.");

    const stocks = await tx.select({ id: materialStocks.id, quantity: materialStocks.quantity }).from(materialStocks).where(eq(materialStocks.warehouseId, warehouseId)).orderBy(asc(materialStocks.id));
    if (stocks.length === 0) throw new InventoryServiceError("O almoxarifado não possui posições de estoque para inventariar.");

    const [session] = await tx.insert(inventorySessions).values({ warehouseId, createdByUsuarioId }).returning();
    const items = await tx.insert(inventorySessionItems).values(stocks.map(stock => ({ sessionId: session.id, stockId: stock.id, expectedQuantity: stock.quantity }))).returning();
    return { ...session, items };
  });
}

export async function recordInventoryCount(db: DatabaseConnection, input: {
  sessionId: string;
  itemId: string;
  countedQuantity: number;
  divergenceType?: string;
  countEvidence?: string;
  adjustmentReason?: string;
}) {
  const sessionId = required(input.sessionId, "Inventário");
  const itemId = required(input.itemId, "Item do inventário");
  const countedQuantity = validCountedQuantity(input.countedQuantity);
  const requestedType = input.divergenceType?.trim().toUpperCase();
  if (requestedType && !DIVERGENCE_TYPES.has(requestedType)) throw new InventoryServiceError("Tipo de divergência inválido.");

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "InventorySession" WHERE id=${sessionId} FOR UPDATE`);
    const [item] = await tx.select({ id: inventorySessionItems.id, expectedQuantity: inventorySessionItems.expectedQuantity, status: inventorySessions.status }).from(inventorySessionItems).innerJoin(inventorySessions, eq(inventorySessions.id, inventorySessionItems.sessionId)).where(and(eq(inventorySessionItems.id, itemId), eq(inventorySessionItems.sessionId, sessionId))).limit(1);
    if (!item) throw new InventoryServiceError("Item do inventário não encontrado.");
    if (item.status !== "COUNTING") throw new InventoryServiceError("Este inventário não está aberto para contagem.");

    const quantityType = countedQuantity === item.expectedQuantity
      ? "SEM_DIVERGENCIA"
      : countedQuantity > item.expectedQuantity ? "SOBRA" : "FALTA";
    const divergenceType = requestedType && requestedType !== "SEM_DIVERGENCIA" ? requestedType : quantityType;
    const countEvidence = input.countEvidence?.trim() || null;
    const adjustmentReason = input.adjustmentReason?.trim() || null;
    if (divergenceType !== "SEM_DIVERGENCIA" && !countEvidence) {
      throw new InventoryServiceError("Registre a evidência da divergência encontrada.");
    }
    if (countedQuantity !== item.expectedQuantity && !adjustmentReason) {
      throw new InventoryServiceError("Informe a justificativa do ajuste de inventário.");
    }

    const [updated] = await tx.update(inventorySessionItems).set({ countedQuantity, divergenceType, countEvidence, adjustmentReason, countedAt: new Date() }).where(eq(inventorySessionItems.id, item.id)).returning();
    return updated;
  });
}

export async function submitInventoryForApproval(db: DatabaseConnection, sessionId: string) {
  const id = required(sessionId, "Inventário");
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "InventorySession" WHERE id=${id} FOR UPDATE`);
    const [session] = await tx.select().from(inventorySessions).where(eq(inventorySessions.id, id)).limit(1);
    if (!session) throw new InventoryServiceError("Inventário não encontrado.");
    if (session.status !== "COUNTING") throw new InventoryServiceError("O inventário não está aberto para envio.");
    const items = await tx.select({ countedQuantity: inventorySessionItems.countedQuantity }).from(inventorySessionItems).where(eq(inventorySessionItems.sessionId, id));
    if (items.some((item) => item.countedQuantity === null)) {
      throw new InventoryServiceError("Todos os itens devem ser contados antes do envio para aprovação.");
    }
    const [updated] = await tx.update(inventorySessions).set({ status: "PENDING_APPROVAL", submittedAt: new Date() }).where(eq(inventorySessions.id, id)).returning();
    return updated;
  });
}

export async function closeApprovedInventory(db: DatabaseConnection, input: {
  sessionId: string;
  approvalEvidence: string;
  actor: InventoryActor;
}) {
  const sessionId = required(input.sessionId, "Inventário");
  const approvalEvidence = required(input.approvalEvidence, "Evidência da aprovação");
  const approvedByUsuarioId = required(input.actor.usuarioId, "Usuário aprovador");

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "InventorySession" WHERE id=${sessionId} FOR UPDATE`);
    const [session] = await tx.select().from(inventorySessions).where(eq(inventorySessions.id, sessionId)).limit(1);
    if (!session) throw new InventoryServiceError("Inventário não encontrado.");
    if (session.status !== "PENDING_APPROVAL") throw new InventoryServiceError("O inventário ainda não está aguardando aprovação.");
    if (session.createdByUsuarioId === approvedByUsuarioId) {
      throw new InventoryServiceError("Segregação de Funções: O aprovador do inventário deve ser diferente do servidor inventoriante que iniciou a sessão.");
    }

    const items = await tx.select({ item: inventorySessionItems, stock: { warehouseId: materialStocks.warehouseId, materialId: materialStocks.materialId, batchNumber: materialStocks.batchNumber, unitCost: materialStocks.unitCost } }).from(inventorySessionItems).innerJoin(materialStocks, eq(materialStocks.id, inventorySessionItems.stockId)).where(eq(inventorySessionItems.sessionId, session.id));
    for (const { item, stock } of items) {
      if (item.countedQuantity === null) throw new InventoryServiceError("Todos os itens devem ser contados antes do encerramento.");
      const adjustment = item.countedQuantity - item.expectedQuantity;
      if (adjustment === 0) continue;
      if (!item.adjustmentReason) throw new InventoryServiceError("Toda divergência deve ter justificativa de ajuste.");

      const { movement } = await applyStockMovement(tx, {
        kind: "ADJUSTMENT",
        warehouseId: stock.warehouseId,
        materialId: stock.materialId,
        batchNumber: stock.batchNumber,
        quantity: adjustment,
        unitCost: stock.unitCost,
        reason: `Inventário ${session.id}: ${item.adjustmentReason}`,
        inventorySessionId: session.id,
        idempotencyKey: `INVENTORY_CLOSE:${session.id}:${item.id}`,
        actor: { usuarioId: approvedByUsuarioId, employeeId: input.actor.employeeId },
      });
      await tx.update(inventorySessionItems).set({ adjustmentMovementId: movement.id }).where(eq(inventorySessionItems.id, item.id));
    }

    const [closed] = await tx.update(inventorySessions).set({
        status: "CLOSED",
        lockMovements: false,
        approvedAt: new Date(),
        closedAt: new Date(),
        approvalEvidence,
        approvedByUsuarioId,
    }).where(eq(inventorySessions.id, session.id)).returning();
    return closed;
  });
}

export type InventoryTransaction = DatabaseTransaction;
