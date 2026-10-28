import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { departments, employees } from "@/db/schema/administration";
import { materialRequestItems, materialRequests } from "@/db/schema/assets-requests";
import { materialMovements, materials, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { documents } from "@/db/schema/registry";
import { procurementContracts, purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { procurementLifecycleEvents, purchaseRequests, purchaseProcessItemOrigins, purchaseProcessRequestOrigins, purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";
import { loadPurchaseRequestsWithAllocations, materialRequestFinancialOrigin, purchaseProcessRequestIds, purchaseRequestsWithinBudgetScope } from "@/db/repositories/procurement/lifecycle";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { nextYearlyCodeDrizzle } from "@/db/repositories/platform/sequences";
import { recordEquipmentCustody } from "@/lib/patrimonio/equipment-custody";
import { dateOnly, todayInBrazil } from "@/lib/frotas/contract";
import { assertPurchaseRequestItemBudgetAllocations, PurchaseRequestBudgetError } from "./purchase-request-budget";
import { aggregatePurchaseRequestItems, PurchaseProcessOriginError, type AggregatedPurchaseProcessItem } from "./purchase-process-origins";

type Db = DatabaseConnection;
type Tx = DatabaseTransaction;

export class ProcurementLifecycleError extends Error {}

export type ProcurementActor = {
  usuarioId: string;
  employeeId: string | null;
  allowedBudgetUnitIds?: string[];
};

export type CreateMaterialRequestInput = {
  number?: string;
  sourceWarehouseId: string;
  departmentId?: string;
  justification?: string;
  idempotencyKey: string;
  items: Array<{ materialId: string; quantityRequested: number }>;
};

export type IssueMaterialRequestInFullInput = {
  requestId: string;
  stockByItem: Array<{ requestItemId: string; stockId: string; settlementId?: string }>;
};

function required(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new ProcurementLifecycleError(`${label} é obrigatório.`);
  return normalized;
}

function optionalText(value: string | undefined, label: string, maximum = 160) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) throw new ProcurementLifecycleError(`${label} deve ter no máximo ${maximum} caracteres.`);
  return normalized;
}

function quantity(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new ProcurementLifecycleError(`${label} deve ser maior que zero.`);
  return value;
}

function idempotencyKey(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

async function writeLifecycleEvent(
  tx: Tx,
  input: { eventType: string; entityType: string; entityId: string; sourceType?: string; sourceId?: string; actorUsuarioId: string; idempotencyKey: string },
) {
  await tx.insert(procurementLifecycleEvents).values(input);
}

async function assertRequestBudgetScope(tx: Tx, actor: ProcurementActor, requestIds: string[]) {
  if (actor.allowedBudgetUnitIds === undefined) return;
  const ids = [...new Set(requestIds)];
  if (!await purchaseRequestsWithinBudgetScope(tx, ids, actor.allowedBudgetUnitIds)) throw new ProcurementLifecycleError("Solicitação sem UG/ente conciliados ou fora das unidades gestoras autorizadas.");
}

async function assertProcessBudgetScope(tx: Tx, actor: ProcurementActor, processId: string) {
  if (actor.allowedBudgetUnitIds === undefined) return;
  const ids = await purchaseProcessRequestIds(tx, processId);
  if (!ids) throw new ProcurementLifecycleError("Processo de compra não encontrado no acesso autorizado.");
  await assertRequestBudgetScope(tx, actor, ids);
}

export async function createMaterialRequest(db: Db, actor: ProcurementActor, input: CreateMaterialRequestInput) {
  const requesterId = required(actor.employeeId, "Servidor solicitante");
  const sourceWarehouseId = required(input.sourceWarehouseId, "Almoxarifado de origem");
  if (input.number?.trim()) throw new ProcurementLifecycleError("O código da requisição é gerado automaticamente; não informe letras ou número manual.");
  const idempotencyKey = required(input.idempotencyKey, "Chave de idempotência");
  if (!input.items.length) throw new ProcurementLifecycleError("A requisição deve possuir ao menos um item.");
  if (new Set(input.items.map((item) => item.materialId)).size !== input.items.length) {
    throw new ProcurementLifecycleError("Não repita o mesmo material na requisição.");
  }
  input.items.forEach((item) => {
    required(item.materialId, "Material");
    quantity(item.quantityRequested, "Quantidade solicitada");
  });

  return withDatabaseTransaction(db, async (tx) => {
    const [existing] = await tx.select().from(materialRequests).where(eq(materialRequests.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) return existing;

    const [[requester], selectedMaterials] = await Promise.all([
      tx.select({ id: employees.id, departmentId: employees.departmentId }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, requesterId), eq(employees.isActive, true), eq(departments.isActive, true))).limit(1),
      tx.select({ id: materials.id, type: materials.type }).from(materials).where(and(inArray(materials.id, input.items.map(item => item.materialId)), eq(materials.isActive, true))),
    ]);
    if (!requester?.departmentId) throw new ProcurementLifecycleError("O solicitante deve estar vinculado a um setor ativo.");
    if (input.departmentId && input.departmentId !== requester.departmentId) throw new ProcurementLifecycleError("O servidor solicitante deve pertencer ao setor de destino.");
    if (!(await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, sourceWarehouseId), eq(warehouses.isActive, true))).limit(1)).length) throw new ProcurementLifecycleError("Selecione um almoxarifado de origem ativo.");
    if (selectedMaterials.length !== input.items.length) throw new ProcurementLifecycleError("Selecione apenas materiais existentes.");
    if (input.items.some(item => selectedMaterials.find(material => material.id === item.materialId)?.type === "PATRIMONIO" && !Number.isInteger(item.quantityRequested))) throw new ProcurementLifecycleError("Equipamentos devem ser requisitados em unidades inteiras.");

    const number = await nextYearlyCodeDrizzle({
      db: tx,
      key: "patrimonio-requisicao-material",
      prefix: "REQ",
      padding: 6,
      existingCodes: (await tx.select({ number: materialRequests.number }).from(materialRequests)).map(({ number }) => ({ code: number })),
    });
    const [request] = await tx.insert(materialRequests).values({
        number,
        sourceWarehouseId,
        idempotencyKey,
        justification: input.justification?.trim() || null,
        departmentId: requester.departmentId,
        requesterId: requester.id,
    }).returning();
    await tx.insert(materialRequestItems).values(input.items.map(item => ({ requestId: request.id, materialId: item.materialId.trim(), quantityRequested: item.quantityRequested })));
    await writeLifecycleEvent(tx, {
      eventType: "MATERIAL_REQUEST_CREATED",
      entityType: "MATERIAL_REQUEST",
      entityId: request.id,
      sourceType: "MATERIAL_REQUEST",
      sourceId: request.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: `C5:MATERIAL_REQUEST:${request.id}:CREATED`,
    });
    return request;
  });
}

export async function approvePurchaseRequest(db: Db, actor: ProcurementActor, purchaseRequestId: string) {
  const actorEmployeeId = required(actor.employeeId, "Servidor aprovador");
  const requestId = required(purchaseRequestId, "Solicitação de compra");
  const eventKey = `C5:PURCHASE_REQUEST:${requestId}:APPROVE`;
  return withDatabaseTransaction(db, async (tx) => {
    await assertRequestBudgetScope(tx, actor, [requestId]);
    const [existingEvent] = await tx.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey)).limit(1);
    const [request] = await loadPurchaseRequestsWithAllocations(tx, [requestId]);
    if (!request) throw new ProcurementLifecycleError("Solicitação de compra não encontrada.");
    if (existingEvent) {
      const [record] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId)).limit(1);
      return record;
    }
    if (!request.items.length) throw new ProcurementLifecycleError("A solicitação deve possuir ao menos um item antes da aprovação.");
    if (!['Rascunho', 'Enviada'].includes(request.status)) throw new ProcurementLifecycleError("Somente solicitações em rascunho ou enviadas podem ser aprovadas.");
    if (request.requesterId === actorEmployeeId) throw new ProcurementLifecycleError("Segregação de funções: o solicitante não pode aprovar a própria solicitação.");
    try {
      for (const item of request.items) {
        assertPurchaseRequestItemBudgetAllocations(item, item.budgetAllocations);
      }
    } catch (error) {
      if (error instanceof PurchaseRequestBudgetError) throw new ProcurementLifecycleError(error.message);
      throw error;
    }

    const [approved] = await tx.update(purchaseRequests).set({ status: "Aprovada", approvedByEmployeeId: actorEmployeeId, approvedAt: new Date() }).where(eq(purchaseRequests.id, request.id)).returning();
    await writeLifecycleEvent(tx, {
      eventType: "PURCHASE_REQUEST_APPROVED",
      entityType: "PURCHASE_REQUEST",
      entityId: approved.id,
      sourceType: "PURCHASE_REQUEST",
      sourceId: approved.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: eventKey,
    });
    return approved;
  });
}

export type CreatePurchaseProcessFromApprovedRequestsInput = {
  purchaseRequestIds: string[];
  number: string;
  object?: string;
  type: string;
  modality?: string;
  idempotencyKey?: string;
};

export async function createPurchaseProcessFromApprovedRequests(
  db: Db,
  actor: ProcurementActor,
  input: CreatePurchaseProcessFromApprovedRequestsInput,
) {
  if (!Array.isArray(input.purchaseRequestIds) || !input.purchaseRequestIds.length) {
    throw new ProcurementLifecycleError("Selecione ao menos uma solicitação de compra aprovada.");
  }
  const purchaseRequestIds = input.purchaseRequestIds.map((requestId) => required(requestId, "Solicitação de compra"));
  if (new Set(purchaseRequestIds).size !== purchaseRequestIds.length) {
    throw new ProcurementLifecycleError("Não repita a mesma solicitação na formação do processo.");
  }
  const number = required(input.number, "Número do processo");
  const type = required(input.type, "Tipo do processo");
  const eventKey = idempotencyKey(input.idempotencyKey, `C5:PURCHASE_PROCESS:${[...purchaseRequestIds].sort().join(":")}:${number}`);

  return withDatabaseTransaction(db, async (tx) => {
    const [existingEvent] = await tx.select({ entityId: procurementLifecycleEvents.entityId }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey)).limit(1);
    if (existingEvent) {
      await assertProcessBudgetScope(tx, actor, existingEvent.entityId);
      const [existingProcess] = await tx.select().from(purchaseProcesses).where(eq(purchaseProcesses.id, existingEvent.entityId)).limit(1);
      if (!existingProcess) throw new ProcurementLifecycleError("Processo de compra não encontrado.");
      return existingProcess;
    }
    await assertRequestBudgetScope(tx, actor, purchaseRequestIds);

    const requests = await loadPurchaseRequestsWithAllocations(tx, purchaseRequestIds);
    if (requests.length !== purchaseRequestIds.length) {
      throw new ProcurementLifecycleError("Solicitação de compra não encontrada.");
    }
    const requestsById = new Map(requests.map((request) => [request.id, request]));
    const orderedRequests = purchaseRequestIds.map((requestId) => requestsById.get(requestId)!);
    if (orderedRequests.some((request) => request.status !== "Aprovada")) {
      throw new ProcurementLifecycleError("O processo de compra exige solicitações aprovadas.");
    }
    if (orderedRequests.some((request) => !request.items.length)) {
      throw new ProcurementLifecycleError("A solicitação aprovada não possui itens.");
    }
    if (orderedRequests.some((request) => request.secretariatId !== orderedRequests[0].secretariatId)) {
      throw new ProcurementLifecycleError("As solicitações agrupadas devem pertencer à mesma secretaria.");
    }

    try {
      for (const request of orderedRequests) {
        for (const item of request.items) {
          assertPurchaseRequestItemBudgetAllocations(item, item.budgetAllocations);
        }
      }
    } catch (error) {
      if (error instanceof PurchaseRequestBudgetError) throw new ProcurementLifecycleError(error.message);
      throw error;
    }

    const requestItems = orderedRequests.flatMap((request) => request.items);
    const existingOrigins = await tx.select({ purchaseRequestItemId: purchaseProcessItemOrigins.purchaseRequestItemId, quantity: purchaseProcessItemOrigins.quantity }).from(purchaseProcessItemOrigins).where(inArray(purchaseProcessItemOrigins.purchaseRequestItemId, requestItems.map(item => item.id)));
    if (existingOrigins.length) {
      throw new ProcurementLifecycleError("Uma das solicitações selecionadas já possui quantidade destinada a outro processo.");
    }
    const legacyLinkedProcesses = await tx.select({ id: purchaseProcesses.id }).from(purchaseProcesses).where(inArray(purchaseProcesses.purchaseRequestId, purchaseRequestIds));
    if (legacyLinkedProcesses.length) {
      throw new ProcurementLifecycleError("Uma das solicitações selecionadas já está vinculada a outro processo.");
    }

    let groupedItems: AggregatedPurchaseProcessItem[];
    try {
      groupedItems = aggregatePurchaseRequestItems(requestItems);
    } catch (error) {
      if (error instanceof PurchaseProcessOriginError) throw new ProcurementLifecycleError(error.message);
      throw error;
    }

    const requestedObject = input.object?.trim();
    if (orderedRequests.length > 1 && !requestedObject) {
      throw new ProcurementLifecycleError("Informe o objeto do processo para agrupar solicitações distintas.");
    }
    const [process] = await tx.insert(purchaseProcesses).values({
        number,
        object: requestedObject || orderedRequests[0].object,
        type,
        modality: input.modality?.trim() || undefined,
        estimatedValue: groupedItems.reduce((total, item) => total + (item.quantity * item.estimatedUnitValue), 0),
        status: "Em Planejamento",
        secretariatId: orderedRequests[0].secretariatId,
        // Preserve the legacy single-request relation for existing consumers.
        purchaseRequestId: orderedRequests[0].id,
    }).returning();
    await tx.insert(purchaseProcessRequestOrigins).values(orderedRequests.map(request => ({ purchaseProcessId: process.id, purchaseRequestId: request.id })));
    for (const item of groupedItems) {
      const [line] = await tx.insert(purchaseProcessItems).values({ purchaseProcessId: process.id, catalogItemId: item.catalogItemId, materialId: item.materialId, customName: item.customName, quantity: item.quantity, estimatedUnitValue: item.estimatedUnitValue }).returning({ id: purchaseProcessItems.id });
      if (item.origins.length) await tx.insert(purchaseProcessItemOrigins).values(item.origins.map(origin => ({ ...origin, purchaseProcessItemId: line.id })));
    }
    await writeLifecycleEvent(tx, {
      eventType: "PURCHASE_PROCESS_CREATED",
      entityType: "PURCHASE_PROCESS",
      entityId: process.id,
      sourceType: orderedRequests.length > 1 ? "PURCHASE_REQUEST_GROUP" : "PURCHASE_REQUEST",
      sourceId: orderedRequests[0].id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: eventKey,
    });
    return process;
  }, { isolationLevel: "serializable" });
}

export async function createPurchaseProcessFromApprovedRequest(
  db: Db,
  actor: ProcurementActor,
  input: { purchaseRequestId: string; number: string; type: string; modality?: string; idempotencyKey?: string },
) {
  return createPurchaseProcessFromApprovedRequests(db, actor, {
    purchaseRequestIds: [input.purchaseRequestId],
    number: input.number,
    type: input.type,
    modality: input.modality,
    idempotencyKey: input.idempotencyKey,
  });
}

export type ApprovePurchaseReceiptInput = {
  number: string;
  receivedAt: Date;
  contractId: string;
  documentId: string;
  receiverId: string;
  attesterId: string;
  idempotencyKey: string;
  items: Array<{
    purchaseProcessItemId: string;
    materialId: string;
    warehouseId: string;
    quantity: number;
    unitCost: number;
    batchNumber?: string;
    expirationDate?: Date;
    brand?: string;
    model?: string;
    serialNumber?: string;
  }>;
};

function normalizePurchaseReceiptInput(rawInput: ApprovePurchaseReceiptInput) {
  const input = {
    ...rawInput,
    number: required(rawInput.number, "Número do recebimento"),
    contractId: required(rawInput.contractId, "Contrato"),
    documentId: required(rawInput.documentId, "Documento GED"),
    receiverId: required(rawInput.receiverId, "Recebedor"),
    attesterId: required(rawInput.attesterId, "Atestador"),
    idempotencyKey: required(rawInput.idempotencyKey, "Chave de idempotência"),
    items: rawInput.items.map((item) => ({
      ...item,
      brand: optionalText(item.brand, "Marca"),
      model: optionalText(item.model, "Modelo"),
      serialNumber: optionalText(item.serialNumber, "Número de série"),
    })),
  };
  if (!Number.isFinite(input.receivedAt.valueOf())) throw new ProcurementLifecycleError("Data de recebimento inválida.");
  if (!input.items.length) throw new ProcurementLifecycleError("O recebimento deve possuir ao menos um item.");
  if (input.receiverId === input.attesterId) throw new ProcurementLifecycleError("Recebedor e atestador devem ser servidores distintos.");
  if (new Set(input.items.map((item) => item.purchaseProcessItemId)).size !== input.items.length) {
    throw new ProcurementLifecycleError("Cada item do processo pode constar uma única vez no recebimento.");
  }
  input.items.forEach((item) => {
    required(item.purchaseProcessItemId, "Item do processo");
    required(item.materialId, "Material de estoque");
    required(item.warehouseId, "Almoxarifado");
    quantity(item.quantity, "Quantidade recebida");
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) throw new ProcurementLifecycleError("Custo unitário inválido.");
  });

  return input;
}

export async function approvePurchaseReceipt(db: Db, actor: ProcurementActor, rawInput: ApprovePurchaseReceiptInput) {
  const input = normalizePurchaseReceiptInput(rawInput);
  return withDatabaseTransaction(db, tx => recordApprovedPurchaseReceipt(tx, actor, input));
}

export async function approvePurchaseReceiptInTransaction(tx: Tx, actor: ProcurementActor, rawInput: ApprovePurchaseReceiptInput) {
  return recordApprovedPurchaseReceipt(tx, actor, normalizePurchaseReceiptInput(rawInput));
}

async function recordApprovedPurchaseReceipt(tx: Tx, actor: ProcurementActor, input: ReturnType<typeof normalizePurchaseReceiptInput>) {
    await tx.execute(sql`SELECT id FROM "PurchaseProcessItem" WHERE id IN (${sql.join(input.items.map(item => item.purchaseProcessItemId).sort().map(id => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
    const [existingRecord] = await tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    const existing = existingRecord ? { ...existingRecord, items: await tx.select().from(purchaseReceiptItems).where(eq(purchaseReceiptItems.purchaseReceiptId, existingRecord.id)) } : null;
    if (existing) {
      await assertProcessBudgetScope(tx, actor, existing.purchaseProcessId);
      if (existing.contractId !== input.contractId || existing.documentId !== input.documentId || existing.number !== input.number || existing.receiverId !== input.receiverId || existing.attesterId !== input.attesterId || existing.receivedAt.valueOf() !== input.receivedAt.valueOf() || existing.items.length !== input.items.length || input.items.some(item => !existing.items.some(prior => prior.purchaseProcessItemId === item.purchaseProcessItemId && prior.materialId === item.materialId && prior.warehouseId === item.warehouseId && prior.quantity === item.quantity && prior.unitCost === item.unitCost && prior.batchNumber === (item.batchNumber?.trim() || "") && (prior.expirationDate?.valueOf() ?? null) === (item.expirationDate?.valueOf() ?? null) && prior.brand === item.brand && prior.model === item.model && prior.serialNumber === item.serialNumber))) throw new ProcurementLifecycleError("Recebimento já registrado com outros dados. Preserve o registro confirmado.");
      return existing;
    }

    const [[contractRow], [document], [receiver], [attester]] = await Promise.all([
      tx.select({ contract: procurementContracts, purchaseRequest: { requesterId: purchaseRequests.requesterId, status: purchaseRequests.status } }).from(procurementContracts)
        .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId))
        .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).where(eq(procurementContracts.id, input.contractId)).limit(1),
      tx.select({ id: documents.id, status: documents.status }).from(documents).where(eq(documents.id, input.documentId)).limit(1),
      tx.select({ id: employees.id, isActive: employees.isActive }).from(employees).where(eq(employees.id, input.receiverId)).limit(1),
      tx.select({ id: employees.id, isActive: employees.isActive }).from(employees).where(eq(employees.id, input.attesterId)).limit(1),
    ]);
    const contract = contractRow?.contract;
    if (!contract || contract.status !== "Vigente" || input.receivedAt < contract.startDate || input.receivedAt > contract.endDate) {
      throw new ProcurementLifecycleError("O recebimento exige contrato vigente na data informada.");
    }
    await assertProcessBudgetScope(tx, actor, contract.processId);
    if (!contractRow.purchaseRequest || contractRow.purchaseRequest.status !== "Aprovada") {
      throw new ProcurementLifecycleError("O contrato deve decorrer de uma solicitação de compra aprovada.");
    }
    if (!document || document.status !== "Válido") throw new ProcurementLifecycleError("O documento GED deve estar válido.");
    if (!receiver?.isActive || !attester?.isActive) throw new ProcurementLifecycleError("Recebedor e atestador devem estar ativos.");
    const requesterId = contractRow.purchaseRequest?.requesterId;
    if (requesterId && (requesterId === input.receiverId || requesterId === input.attesterId)) {
      throw new ProcurementLifecycleError("Segregação de funções: solicitante não pode receber ou atestar o próprio recebimento.");
    }

    const processItemIds = input.items.map((item) => item.purchaseProcessItemId);
    const [processItems, priorReceiptItems] = await Promise.all([
      tx.select({ id: purchaseProcessItems.id, quantity: purchaseProcessItems.quantity, materialId: purchaseProcessItems.materialId, material: { type: materials.type } }).from(purchaseProcessItems).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).where(and(inArray(purchaseProcessItems.id, processItemIds), eq(purchaseProcessItems.purchaseProcessId, contract.processId))),
      tx.select({ purchaseProcessItemId: purchaseReceiptItems.purchaseProcessItemId, quantity: purchaseReceiptItems.quantity }).from(purchaseReceiptItems).innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId)).where(and(inArray(purchaseReceiptItems.purchaseProcessItemId, processItemIds), eq(purchaseReceipts.status, "APPROVED"))),
    ]);
    if (processItems.length !== input.items.length) throw new ProcurementLifecycleError("Item recebido não pertence ao processo do contrato.");
    const priorByItem = new Map<string, number>();
    for (const item of priorReceiptItems) priorByItem.set(item.purchaseProcessItemId, (priorByItem.get(item.purchaseProcessItemId) ?? 0) + item.quantity);
    for (const item of input.items) {
      const source = processItems.find((processItem) => processItem.id === item.purchaseProcessItemId)!;
      if (source.materialId !== item.materialId) {
        throw new ProcurementLifecycleError("O material recebido deve corresponder ao item de material do processo de compra.");
      }
      if (!source.material) {
        throw new ProcurementLifecycleError("O item do processo não possui material disponível para recebimento.");
      }
      if ((priorByItem.get(source.id) ?? 0) + item.quantity > source.quantity) {
        throw new ProcurementLifecycleError("A quantidade recebida excede o saldo do item do processo.");
      }
      if (source.material.type === "PATRIMONIO" && !Number.isInteger(item.quantity)) {
        throw new ProcurementLifecycleError("Itens patrimoniais devem ser recebidos em quantidade inteira.");
      }
      if (source.material.type === "PATRIMONIO" && item.serialNumber && item.quantity !== 1) {
        throw new ProcurementLifecycleError("Um item patrimonial com número de série deve ser recebido em quantidade unitária.");
      }
    }

    const [receipt] = await tx.insert(purchaseReceipts).values({
        number: input.number,
        receivedAt: input.receivedAt,
        contractId: contract.id,
        purchaseProcessId: contract.processId,
        documentId: document.id,
        receiverId: receiver.id,
        attesterId: attester.id,
        idempotencyKey: input.idempotencyKey,
        sourceType: "CONTRACT",
        sourceId: contract.id,
    }).returning();
    for (const item of input.items) {
      const { movement } = await applyStockMovement(tx, {
        kind: "ENTRY",
        sourceType: "APPROVED_PURCHASE_RECEIPT",
        warehouseId: item.warehouseId,
        materialId: item.materialId,
        quantity: item.quantity,
        batchNumber: item.batchNumber,
        expirationDate: item.expirationDate,
        unitCost: item.unitCost,
        reason: `Recebimento aprovado ${receipt.number}`,
        supplierId: contract.supplierId,
        actor,
      });
      await tx.insert(purchaseReceiptItems).values({
          purchaseReceiptId: receipt.id,
          purchaseProcessItemId: item.purchaseProcessItemId,
          materialId: item.materialId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          batchNumber: item.batchNumber?.trim() ?? "",
          expirationDate: item.expirationDate,
          brand: item.brand,
          model: item.model,
          serialNumber: item.serialNumber,
          stockMovementId: movement.id,
      });
    }
    await writeLifecycleEvent(tx, {
      eventType: "PURCHASE_RECEIPT_APPROVED",
      entityType: "PURCHASE_RECEIPT",
      entityId: receipt.id,
      sourceType: "CONTRACT",
      sourceId: contract.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: `C5:PURCHASE_RECEIPT:${receipt.id}:APPROVED`,
    });
    return receipt;
}

export async function approveMaterialRequest(db: Db, actor: ProcurementActor, input: { requestId: string; quantities: Array<{ itemId: string; quantityApproved: number }> }) {
  const requestId = required(input.requestId, "Requisição de material");
  const actorEmployeeId = required(actor.employeeId, "Servidor aprovador");
  if (!input.quantities.length) throw new ProcurementLifecycleError("Informe as quantidades aprovadas.");
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "MaterialRequest" WHERE id=${requestId} FOR UPDATE`);
    const [record] = await tx.select().from(materialRequests).where(eq(materialRequests.id, requestId)).limit(1);
    const request = record ? { ...record, items: await tx.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, requestId)) } : null;
    if (!request) throw new ProcurementLifecycleError("Requisição de material não encontrada.");
    if (request.status !== "Pendente") throw new ProcurementLifecycleError("Somente requisições pendentes podem ser aprovadas.");
    if (request.requesterId === actorEmployeeId) throw new ProcurementLifecycleError("Segregação de funções: o solicitante não pode aprovar a própria requisição.");
    if (new Set(input.quantities.map((item) => item.itemId)).size !== input.quantities.length || input.quantities.length !== request.items.length) {
      throw new ProcurementLifecycleError("Informe uma quantidade aprovada para cada item da requisição.");
    }
    for (const approved of input.quantities) {
      const item = request.items.find((requestItem) => requestItem.id === approved.itemId);
      if (!item || !Number.isFinite(approved.quantityApproved) || approved.quantityApproved < 0 || approved.quantityApproved > item.quantityRequested) {
        throw new ProcurementLifecycleError("Quantidade aprovada inválida para a requisição.");
      }
      await tx.update(materialRequestItems).set({ quantityApproved: approved.quantityApproved }).where(eq(materialRequestItems.id, item.id));
    }
    const hasApprovedItems = input.quantities.some(item => item.quantityApproved > 0);
    const [approved] = await tx.update(materialRequests).set({ status: hasApprovedItems ? "Aprovada" : "Recusada", approvedByEmployeeId: actorEmployeeId, approvedAt: new Date() }).where(eq(materialRequests.id, request.id)).returning();
    await writeLifecycleEvent(tx, {
      eventType: "MATERIAL_REQUEST_APPROVED",
      entityType: "MATERIAL_REQUEST",
      entityId: approved.id,
      sourceType: "MATERIAL_REQUEST",
      sourceId: approved.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: `C5:MATERIAL_REQUEST:${approved.id}:APPROVED`,
    });
    return approved;
  });
}

async function assertMaterialRequestFinancialOrigin(tx: Tx, actor: ProcurementActor, input: { settlementId?: string; stockId: string; departmentId: string }) {
  if (!input.settlementId) return;
  await tx.execute(sql`SELECT id FROM "Settlement" WHERE id=${input.settlementId} FOR UPDATE`);
  const origin = await materialRequestFinancialOrigin(tx, { ...input, settlementId: input.settlementId, usuarioId: actor.usuarioId });
  if (origin && actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(origin.budgetUnitId)) throw new ProcurementLifecycleError("Liquidação fora das UGs autorizadas.");
  if (!origin?.valid) throw new ProcurementLifecycleError("Origem financeira, material, almoxarifado e destino devem pertencer ao mesmo ente/secretaria da UG de consumo.");
  if (!origin.userActive) throw new ProcurementLifecycleError("Responsável sem vínculo ativo com a UG da liquidação.");
  if (origin.receiptLinked && !origin.materialLinked) throw new ProcurementLifecycleError("Material/lote não pertence ao recebimento da liquidação.");
  if (!origin.receiptLinked && !origin.consumptionNature) throw new ProcurementLifecycleError("Origem sem recebimento deve identificar material de consumo.");
}

export async function issueMaterialRequestItem(db: Db, actor: ProcurementActor, input: { requestItemId: string; stockId: string; quantity: number; settlementId?: string; idempotencyKey?: string }) {
  const requestItemId = required(input.requestItemId, "Item da requisição");
  const stockId = required(input.stockId, "Posição de estoque");
  const issuedQuantity = quantity(input.quantity, "Quantidade atendida");
  const issuerId = required(actor.employeeId, "Servidor responsável pela saída");
  return withDatabaseTransaction(db, async (tx) => {
    // Serializa atendimento parcial e integral no mesmo pedido.
    await tx.execute(sql`SELECT r.id FROM "MaterialRequest" r JOIN "MaterialRequestItem" i ON i."requestId"=r.id WHERE i.id=${requestItemId} FOR UPDATE OF r`);
    const [[line], [stock]] = await Promise.all([
      tx.select({ item: materialRequestItems, request: materialRequests }).from(materialRequestItems).innerJoin(materialRequests, eq(materialRequests.id, materialRequestItems.requestId)).where(eq(materialRequestItems.id, requestItemId)).limit(1),
      tx.select().from(materialStocks).where(eq(materialStocks.id, stockId)).limit(1),
    ]);
    const requestItem = line ? { ...line.item, request: { ...line.request, items: await tx.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, line.request.id)) } } : null;
    if (!requestItem || !stock) throw new ProcurementLifecycleError("Item da requisição ou posição de estoque não encontrada.");
    const deliveryKey = input.idempotencyKey ? `MATERIAL_REQUEST_DELIVERY:${input.idempotencyKey}` : undefined;
    if (deliveryKey) {
      const [prior] = await tx.select({ materialRequestItemId: materialMovements.materialRequestItemId, stockId: materialMovements.stockId, quantity: materialMovements.quantity, settlementId: materialMovements.settlementId }).from(materialMovements).where(eq(materialMovements.idempotencyKey, deliveryKey)).limit(1);
      if (prior) {
        if (prior.materialRequestItemId !== requestItemId || prior.stockId !== stockId || prior.quantity !== issuedQuantity || (prior.settlementId || undefined) !== input.settlementId) throw new ProcurementLifecycleError("Entrega já registrada com outros dados.");
        return requestItem.request;
      }
    }
    if (stock.blockedAt || (stock.expirationDate && stock.expirationDate < dateOnly(todayInBrazil()))) throw new ProcurementLifecycleError("Não é possível entregar material de lote bloqueado ou vencido.");
    if (requestItem.request.status !== "Aprovada" && requestItem.request.status !== "Atendida Parcialmente") {
      throw new ProcurementLifecycleError("A saída exige uma requisição de material aprovada.");
    }
    if (requestItem.materialId !== stock.materialId) throw new ProcurementLifecycleError("O material da posição de estoque não corresponde ao item requisitado.");
    if (requestItem.request.sourceWarehouseId && stock.warehouseId !== requestItem.request.sourceWarehouseId) throw new ProcurementLifecycleError("Selecione um lote do almoxarifado de origem da requisição.");
    if (requestItem.quantityDelivered + issuedQuantity > requestItem.quantityApproved) throw new ProcurementLifecycleError("A saída excede a quantidade aprovada.");
    await assertMaterialRequestFinancialOrigin(tx, actor, { settlementId: input.settlementId, stockId: stock.id, departmentId: requestItem.request.departmentId });

    const { movement } = await applyStockMovement(tx, {
      kind: "EXIT",
      sourceType: "MATERIAL_REQUEST_ISSUE",
      idempotencyKey: deliveryKey,
      materialRequestItemId: requestItem.id,
      warehouseId: stock.warehouseId,
      materialId: stock.materialId,
      batchNumber: stock.batchNumber,
      quantity: issuedQuantity,
      unitCost: stock.unitCost,
      departmentId: requestItem.request.departmentId,
      settlementId: input.settlementId,
      reason: `${input.settlementId ? "CONSUMO_ORCAMENTARIO:" : ""}Requisição de material ${requestItem.request.number}`,
      actor,
    });
    await recordEquipmentCustody(tx, { materialId: stock.materialId, quantity: issuedQuantity, departmentId: requestItem.request.departmentId, responsibleId: requestItem.request.requesterId, stockMovementId: movement.id });
    await tx.update(materialRequestItems).set({ quantityDelivered: sql`${materialRequestItems.quantityDelivered} + ${issuedQuantity}` }).where(eq(materialRequestItems.id, requestItem.id));
    const updatedItems = await tx.select({ quantityApproved: materialRequestItems.quantityApproved, quantityDelivered: materialRequestItems.quantityDelivered }).from(materialRequestItems).where(eq(materialRequestItems.requestId, requestItem.requestId));
    const status = updatedItems.every((item) => item.quantityDelivered >= item.quantityApproved) ? "Atendida" : "Atendida Parcialmente";
    const [request] = await tx.update(materialRequests).set({ status, issuedByEmployeeId: issuerId, issuedAt: new Date() }).where(eq(materialRequests.id, requestItem.requestId)).returning();
    await writeLifecycleEvent(tx, {
      eventType: "MATERIAL_REQUEST_ISSUED",
      entityType: "MATERIAL_REQUEST",
      entityId: request.id,
      sourceType: "MATERIAL_REQUEST_ITEM",
      sourceId: requestItem.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: `C5:MATERIAL_REQUEST_ITEM:${requestItem.id}:ISSUED:${requestItem.quantityDelivered + issuedQuantity}`,
    });
    return request;
  });
}

export async function issueMaterialRequestInFull(db: Db, actor: ProcurementActor, input: IssueMaterialRequestInFullInput) {
  const requestId = required(input.requestId, "Requisição de material");
  const issuerId = required(actor.employeeId, "Servidor responsável pela saída");
  const eventKey = `C5:MATERIAL_REQUEST:${requestId}:ISSUED_FULL`;

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "MaterialRequest" WHERE id=${requestId} FOR UPDATE`);
    const [[existingEvent], [record], items] = await Promise.all([
      tx.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey)).limit(1),
      tx.select().from(materialRequests).where(eq(materialRequests.id, requestId)).limit(1),
      tx.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, requestId)),
    ]);
    const request = record ? { ...record, items } : null;
    if (!request) throw new ProcurementLifecycleError("Requisição de material não encontrada.");
    if (existingEvent) {
      for (const assignment of input.stockByItem.filter(item => item.settlementId)) {
        if (!(await tx.select({ id: materialMovements.id }).from(materialMovements).where(and(eq(materialMovements.materialRequestItemId, assignment.requestItemId), eq(materialMovements.stockId, assignment.stockId), eq(materialMovements.settlementId, assignment.settlementId!))).limit(1)).length) throw new ProcurementLifecycleError("Entrega já registrada com outra origem financeira; preserve os movimentos confirmados.");
      }
      return request;
    }
    if (!["Aprovada", "Atendida Parcialmente"].includes(request.status)) {
      throw new ProcurementLifecycleError("A entrega integral exige uma requisição de material aprovada.");
    }

    const remainingItems = request.items.filter((item) => item.quantityApproved > item.quantityDelivered);
    if (new Set(input.stockByItem.map((item) => item.requestItemId)).size !== input.stockByItem.length) {
      throw new ProcurementLifecycleError("Informe uma única posição de estoque para cada item pendente.");
    }
    const assignmentByItem = new Map(input.stockByItem.map((item) => [item.requestItemId, item.stockId.trim()]));
    const financialOriginByItem = new Map(input.stockByItem.map(item => [item.requestItemId, item.settlementId?.trim() || undefined]));
    if (remainingItems.some((item) => !assignmentByItem.get(item.id)) || assignmentByItem.size !== remainingItems.length) {
      throw new ProcurementLifecycleError("Informe a posição de estoque para todos os itens pendentes da requisição.");
    }

    const stockIds = [...assignmentByItem.values()];
    const stocks = stockIds.length
      ? await tx.select().from(materialStocks).where(inArray(materialStocks.id, stockIds))
      : [];
    const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
    for (const item of remainingItems) {
      const stock = stockById.get(assignmentByItem.get(item.id)!);
      if (!stock || stock.materialId !== item.materialId) {
        throw new ProcurementLifecycleError("A posição de estoque deve corresponder ao material requisitado.");
      }
      if (request.sourceWarehouseId && stock.warehouseId !== request.sourceWarehouseId) throw new ProcurementLifecycleError("Selecione lotes do almoxarifado de origem da requisição.");
      if (stock.blockedAt || (stock.expirationDate && stock.expirationDate < dateOnly(todayInBrazil()))) throw new ProcurementLifecycleError("Não é possível entregar material de lote bloqueado ou vencido.");
    }

    // Claim the request before changing balances. A competing full delivery will
    // see the final status after this transaction commits and fail without a duplicate exit.
    const claimed = await tx.update(materialRequests).set({ status: "Em atendimento" }).where(and(eq(materialRequests.id, request.id), inArray(materialRequests.status, ["Aprovada", "Atendida Parcialmente"]))).returning({ id: materialRequests.id });
    if (claimed.length !== 1) {
      throw new ProcurementLifecycleError("A requisição foi alterada por outra operação. Revise e tente novamente.");
    }

    for (const item of remainingItems) {
      const stock = stockById.get(assignmentByItem.get(item.id)!)!;
      const quantityToIssue = item.quantityApproved - item.quantityDelivered;
      await assertMaterialRequestFinancialOrigin(tx, actor, { settlementId: financialOriginByItem.get(item.id), stockId: stock.id, departmentId: request.departmentId });
      const { movement } = await applyStockMovement(tx, {
        kind: "EXIT",
        sourceType: "MATERIAL_REQUEST_ISSUE",
        materialRequestItemId: item.id,
        warehouseId: stock.warehouseId,
        materialId: stock.materialId,
        batchNumber: stock.batchNumber,
        quantity: quantityToIssue,
        unitCost: stock.unitCost,
        departmentId: request.departmentId,
        settlementId: financialOriginByItem.get(item.id),
        reason: `${financialOriginByItem.get(item.id) ? "CONSUMO_ORCAMENTARIO:" : ""}Entrega integral da requisição ${request.number}`,
        actor,
      });
      await recordEquipmentCustody(tx, { materialId: stock.materialId, quantity: quantityToIssue, departmentId: request.departmentId, responsibleId: request.requesterId, stockMovementId: movement.id });
      await tx.update(materialRequestItems).set({ quantityDelivered: sql`${materialRequestItems.quantityDelivered} + ${quantityToIssue}` }).where(eq(materialRequestItems.id, item.id));
    }

    const [issued] = await tx.update(materialRequests).set({ status: "Atendida", issuedByEmployeeId: issuerId, issuedAt: new Date() }).where(eq(materialRequests.id, request.id)).returning();
    await writeLifecycleEvent(tx, {
      eventType: "MATERIAL_REQUEST_ISSUED_FULL",
      entityType: "MATERIAL_REQUEST",
      entityId: issued.id,
      sourceType: "MATERIAL_REQUEST",
      sourceId: issued.id,
      actorUsuarioId: actor.usuarioId,
      idempotencyKey: eventKey,
    });
    return issued;
  });
}
