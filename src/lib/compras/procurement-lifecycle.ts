import { Prisma, type PrismaClient } from "@prisma/client";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { nextYearlyCode } from "@/lib/sequence";
import { recordEquipmentCustody } from "@/lib/patrimonio/equipment-custody";
import { dateOnly, todayInBrazil } from "@/lib/frotas/contract";
import { assertPurchaseRequestItemBudgetAllocations, PurchaseRequestBudgetError } from "./purchase-request-budget";
import { aggregatePurchaseRequestItems, PurchaseProcessOriginError, type AggregatedPurchaseProcessItem } from "./purchase-process-origins";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

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
  await tx.procurementLifecycleEvent.create({ data: input });
}

async function assertRequestBudgetScope(tx: Tx, actor: ProcurementActor, requestIds: string[]) {
  if (actor.allowedBudgetUnitIds === undefined) return;
  const ids = [...new Set(requestIds)];
  const requests = await tx.purchaseRequest.findMany({ where: { id: { in: ids } }, select: {
    secretariatId: true,
    items: { select: { budgetAllocations: { select: { budgetAppropriation: { select: {
      budgetUnitId: true, budgetUnit: { select: { secretariatId: true, planningEntityUnit: { select: { governmentEntityId: true } } } },
      financialYear: { select: { governmentEntityId: true } },
    } } } } } },
  } });
  if (!ids.length || requests.length !== ids.length || requests.some(request => !request.items.length || request.items.some(item => !item.budgetAllocations.length || item.budgetAllocations.some(({ budgetAppropriation: appropriation }) =>
    !actor.allowedBudgetUnitIds!.includes(appropriation.budgetUnitId)
    || appropriation.budgetUnit.secretariatId !== request.secretariatId
    || !appropriation.financialYear.governmentEntityId
    || appropriation.budgetUnit.planningEntityUnit?.governmentEntityId !== appropriation.financialYear.governmentEntityId,
  )))) throw new ProcurementLifecycleError("Solicitação sem UG/ente conciliados ou fora das unidades gestoras autorizadas.");
}

async function assertProcessBudgetScope(tx: Tx, actor: ProcurementActor, processId: string) {
  if (actor.allowedBudgetUnitIds === undefined) return;
  const process = await tx.purchaseProcess.findUnique({ where: { id: processId }, select: { purchaseRequestId: true, requestOrigins: { select: { purchaseRequestId: true } } } });
  if (!process) throw new ProcurementLifecycleError("Processo de compra não encontrado no acesso autorizado.");
  await assertRequestBudgetScope(tx, actor, [...(process.purchaseRequestId ? [process.purchaseRequestId] : []), ...process.requestOrigins.map(origin => origin.purchaseRequestId)]);
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

  return db.$transaction(async (tx) => {
    const existing = await tx.materialRequest.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const [requester, materials] = await Promise.all([
      tx.employee.findFirst({
        where: { id: requesterId, isActive: true, department: { is: { isActive: true } } },
        select: { id: true, departmentId: true },
      }),
      tx.material.findMany({ where: { id: { in: input.items.map((item) => item.materialId) }, isActive: true }, select: { id: true, type: true } }),
    ]);
    if (!requester?.departmentId) throw new ProcurementLifecycleError("O solicitante deve estar vinculado a um setor ativo.");
    if (input.departmentId && input.departmentId !== requester.departmentId) throw new ProcurementLifecycleError("O servidor solicitante deve pertencer ao setor de destino.");
    if (!await tx.warehouse.findFirst({ where: { id: sourceWarehouseId, isActive: true }, select: { id: true } })) throw new ProcurementLifecycleError("Selecione um almoxarifado de origem ativo.");
    if (materials.length !== input.items.length) throw new ProcurementLifecycleError("Selecione apenas materiais existentes.");
    if (input.items.some(item => materials.find(material => material.id === item.materialId)?.type === "PATRIMONIO" && !Number.isInteger(item.quantityRequested))) throw new ProcurementLifecycleError("Equipamentos devem ser requisitados em unidades inteiras.");

    const number = await nextYearlyCode({
      prisma: tx,
      key: "patrimonio-requisicao-material",
      prefix: "REQ",
      padding: 6,
      existingCodes: (await tx.materialRequest.findMany({ select: { number: true } })).map(({ number }) => ({ code: number })),
    });
    const request = await tx.materialRequest.create({
      data: {
        number,
        sourceWarehouseId,
        idempotencyKey,
        justification: input.justification?.trim() || null,
        departmentId: requester.departmentId,
        requesterId: requester.id,
        items: {
          create: input.items.map((item) => ({ materialId: item.materialId.trim(), quantityRequested: item.quantityRequested })),
        },
      },
    });
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
  return db.$transaction(async (tx) => {
    await assertRequestBudgetScope(tx, actor, [requestId]);
    const existingEvent = await tx.procurementLifecycleEvent.findUnique({ where: { idempotencyKey: eventKey }, select: { id: true } });
    if (existingEvent) return tx.purchaseRequest.findUniqueOrThrow({ where: { id: requestId } });

    const request = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { budgetAllocations: true } } },
    });
    if (!request) throw new ProcurementLifecycleError("Solicitação de compra não encontrada.");
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

    const approved = await tx.purchaseRequest.update({
      where: { id: request.id },
      data: { status: "Aprovada", approvedByEmployeeId: actorEmployeeId, approvedAt: new Date() },
    });
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

  return db.$transaction(async (tx) => {
    const existingEvent = await tx.procurementLifecycleEvent.findUnique({ where: { idempotencyKey: eventKey }, select: { entityId: true } });
    if (existingEvent) {
      await assertProcessBudgetScope(tx, actor, existingEvent.entityId);
      return tx.purchaseProcess.findUniqueOrThrow({ where: { id: existingEvent.entityId } });
    }
    await assertRequestBudgetScope(tx, actor, purchaseRequestIds);

    const requests = await tx.purchaseRequest.findMany({
      where: { id: { in: purchaseRequestIds } },
      include: { items: { include: { budgetAllocations: true } } },
    });
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
    const existingOrigins = await tx.purchaseProcessItemOrigin.findMany({
      where: { purchaseRequestItemId: { in: requestItems.map((item) => item.id) } },
      select: { purchaseRequestItemId: true, quantity: true },
    });
    if (existingOrigins.length) {
      throw new ProcurementLifecycleError("Uma das solicitações selecionadas já possui quantidade destinada a outro processo.");
    }
    const legacyLinkedProcesses = await tx.purchaseProcess.findMany({
      where: { purchaseRequestId: { in: purchaseRequestIds } },
      select: { id: true },
    });
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
    const process = await tx.purchaseProcess.create({
      data: {
        number,
        object: requestedObject || orderedRequests[0].object,
        type,
        modality: input.modality?.trim() || undefined,
        estimatedValue: groupedItems.reduce((total, item) => total + (item.quantity * item.estimatedUnitValue), 0),
        status: "Em Planejamento",
        secretariatId: orderedRequests[0].secretariatId,
        // Preserve the legacy single-request relation for existing consumers.
        purchaseRequestId: orderedRequests[0].id,
        requestOrigins: {
          create: orderedRequests.map((request) => ({ purchaseRequestId: request.id })),
        },
        items: {
          create: groupedItems.map((item) => ({
            catalogItemId: item.catalogItemId,
            materialId: item.materialId,
            customName: item.customName,
            quantity: item.quantity,
            estimatedUnitValue: item.estimatedUnitValue,
            requestItemOrigins: {
              create: item.origins,
            },
          })),
        },
      },
    });
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

export async function approvePurchaseReceipt(db: Db, actor: ProcurementActor, rawInput: ApprovePurchaseReceiptInput) {
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

  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "PurchaseProcessItem" WHERE id IN (${Prisma.join(input.items.map(item => item.purchaseProcessItemId).sort())}) ORDER BY id FOR UPDATE`);
    const existing = await tx.purchaseReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
    if (existing) {
      await assertProcessBudgetScope(tx, actor, existing.purchaseProcessId);
      if (existing.contractId !== input.contractId || existing.documentId !== input.documentId || existing.number !== input.number || existing.receiverId !== input.receiverId || existing.attesterId !== input.attesterId || existing.receivedAt.valueOf() !== input.receivedAt.valueOf() || existing.items.length !== input.items.length || input.items.some(item => !existing.items.some(prior => prior.purchaseProcessItemId === item.purchaseProcessItemId && prior.materialId === item.materialId && prior.warehouseId === item.warehouseId && prior.quantity === item.quantity && prior.unitCost === item.unitCost && prior.batchNumber === (item.batchNumber?.trim() || "") && (prior.expirationDate?.valueOf() ?? null) === (item.expirationDate?.valueOf() ?? null) && prior.brand === item.brand && prior.model === item.model && prior.serialNumber === item.serialNumber))) throw new ProcurementLifecycleError("Recebimento já registrado com outros dados. Preserve o registro confirmado.");
      return existing;
    }

    const [contract, document, receiver, attester] = await Promise.all([
      tx.contract.findUnique({
        where: { id: input.contractId },
        include: { process: { include: { purchaseRequest: { select: { requesterId: true, status: true } } } } },
      }),
      tx.document.findUnique({ where: { id: input.documentId }, select: { id: true, status: true } }),
      tx.employee.findUnique({ where: { id: input.receiverId }, select: { id: true, isActive: true } }),
      tx.employee.findUnique({ where: { id: input.attesterId }, select: { id: true, isActive: true } }),
    ]);
    if (!contract || contract.status !== "Vigente" || input.receivedAt < contract.startDate || input.receivedAt > contract.endDate) {
      throw new ProcurementLifecycleError("O recebimento exige contrato vigente na data informada.");
    }
    await assertProcessBudgetScope(tx, actor, contract.processId);
    if (!contract.process.purchaseRequest || contract.process.purchaseRequest.status !== "Aprovada") {
      throw new ProcurementLifecycleError("O contrato deve decorrer de uma solicitação de compra aprovada.");
    }
    if (!document || document.status !== "Válido") throw new ProcurementLifecycleError("O documento GED deve estar válido.");
    if (!receiver?.isActive || !attester?.isActive) throw new ProcurementLifecycleError("Recebedor e atestador devem estar ativos.");
    const requesterId = contract.process.purchaseRequest?.requesterId;
    if (requesterId && (requesterId === input.receiverId || requesterId === input.attesterId)) {
      throw new ProcurementLifecycleError("Segregação de funções: solicitante não pode receber ou atestar o próprio recebimento.");
    }

    const processItemIds = input.items.map((item) => item.purchaseProcessItemId);
    const [processItems, priorReceiptItems] = await Promise.all([
      tx.purchaseProcessItem.findMany({ where: { id: { in: processItemIds }, purchaseProcessId: contract.processId }, select: { id: true, quantity: true, materialId: true, material: { select: { type: true } } } }),
      tx.purchaseReceiptItem.findMany({
        where: { purchaseProcessItemId: { in: processItemIds }, purchaseReceipt: { status: "APPROVED" } },
        select: { purchaseProcessItemId: true, quantity: true },
      }),
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

    const receipt = await tx.purchaseReceipt.create({
      data: {
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
      },
    });
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
      await tx.purchaseReceiptItem.create({
        data: {
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
        },
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
  });
}

export async function approveMaterialRequest(db: Db, actor: ProcurementActor, input: { requestId: string; quantities: Array<{ itemId: string; quantityApproved: number }> }) {
  const requestId = required(input.requestId, "Requisição de material");
  const actorEmployeeId = required(actor.employeeId, "Servidor aprovador");
  if (!input.quantities.length) throw new ProcurementLifecycleError("Informe as quantidades aprovadas.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MaterialRequest" WHERE id=${requestId} FOR UPDATE`;
    const request = await tx.materialRequest.findUnique({ where: { id: requestId }, include: { items: true } });
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
      await tx.materialRequestItem.update({ where: { id: item.id }, data: { quantityApproved: approved.quantityApproved } });
    }
    const hasApprovedItems = input.quantities.some(item => item.quantityApproved > 0);
    const approved = await tx.materialRequest.update({ where: { id: request.id }, data: { status: hasApprovedItems ? "Aprovada" : "Recusada", approvedByEmployeeId: actorEmployeeId, approvedAt: new Date() } });
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
  await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id=${input.settlementId} FOR UPDATE`;
  const settlement = await tx.settlement.findUnique({ where: { id: input.settlementId }, include: { commitment: { include: { appropriation: { include: { financialYear: true, budgetUnit: true, expenseNature: true } } } } } });
  const [stock, department] = await Promise.all([
    tx.materialStock.findUniqueOrThrow({ where: { id: input.stockId }, include: { warehouse: { include: { costCenter: true } }, material: true } }),
    tx.department.findUniqueOrThrow({ where: { id: input.departmentId } }),
  ]);
  const appropriation = settlement?.commitment.appropriation;
  if (appropriation && actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(appropriation.budgetUnitId)) throw new ProcurementLifecycleError("Liquidação fora das UGs autorizadas.");
  if (!appropriation || settlement?.status !== "Liquidado" || !appropriation.financialYear.governmentEntityId || stock.warehouse.costCenter?.governmentEntityId !== appropriation.financialYear.governmentEntityId || stock.warehouse.costCenter.secretariatId !== appropriation.budgetUnit.secretariatId || department.secretariatId !== appropriation.budgetUnit.secretariatId || stock.material.type === "PATRIMONIO") throw new ProcurementLifecycleError("Origem financeira, material, almoxarifado e destino devem pertencer ao mesmo ente/secretaria da UG de consumo.");
  if (!await tx.usuario.count({ where: { id: actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: appropriation.budgetUnitId } } } })) throw new ProcurementLifecycleError("Responsável sem vínculo ativo com a UG da liquidação.");
  if (settlement.commitment.purchaseReceiptId) {
    if (!await tx.purchaseReceiptItem.count({ where: { purchaseReceiptId: settlement.commitment.purchaseReceiptId, materialId: stock.materialId, warehouseId: stock.warehouseId, stockMovement: { stockId: stock.id } } })) throw new ProcurementLifecycleError("Material/lote não pertence ao recebimento da liquidação.");
  } else if (!appropriation.expenseNature.code.replace(/\D/g, "").startsWith("339030")) throw new ProcurementLifecycleError("Origem sem recebimento deve identificar material de consumo.");
}

export async function issueMaterialRequestItem(db: Db, actor: ProcurementActor, input: { requestItemId: string; stockId: string; quantity: number; settlementId?: string; idempotencyKey?: string }) {
  const requestItemId = required(input.requestItemId, "Item da requisição");
  const stockId = required(input.stockId, "Posição de estoque");
  const issuedQuantity = quantity(input.quantity, "Quantidade atendida");
  const issuerId = required(actor.employeeId, "Servidor responsável pela saída");
  return db.$transaction(async (tx) => {
    // Serializa atendimento parcial e integral no mesmo pedido.
    await tx.$queryRaw`SELECT r.id FROM "MaterialRequest" r JOIN "MaterialRequestItem" i ON i."requestId"=r.id WHERE i.id=${requestItemId} FOR UPDATE OF r`;
    const [requestItem, stock] = await Promise.all([
      tx.materialRequestItem.findUnique({ where: { id: requestItemId }, include: { request: { include: { items: true } } } }),
      tx.materialStock.findUnique({ where: { id: stockId }, select: { id: true, warehouseId: true, materialId: true, batchNumber: true, unitCost: true, blockedAt: true, expirationDate: true } }),
    ]);
    if (!requestItem || !stock) throw new ProcurementLifecycleError("Item da requisição ou posição de estoque não encontrada.");
    const deliveryKey = input.idempotencyKey ? `MATERIAL_REQUEST_DELIVERY:${input.idempotencyKey}` : undefined;
    if (deliveryKey) {
      const prior = await tx.materialMovement.findUnique({ where: { idempotencyKey: deliveryKey }, select: { materialRequestItemId: true, stockId: true, quantity: true, settlementId: true } });
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
    await tx.materialRequestItem.update({ where: { id: requestItem.id }, data: { quantityDelivered: { increment: issuedQuantity } } });
    const updatedItems = await tx.materialRequestItem.findMany({ where: { requestId: requestItem.requestId }, select: { quantityApproved: true, quantityDelivered: true } });
    const status = updatedItems.every((item) => item.quantityDelivered >= item.quantityApproved) ? "Atendida" : "Atendida Parcialmente";
    const request = await tx.materialRequest.update({
      where: { id: requestItem.requestId },
      data: { status, issuedByEmployeeId: issuerId, issuedAt: new Date() },
    });
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

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MaterialRequest" WHERE id=${requestId} FOR UPDATE`;
    const [existingEvent, request] = await Promise.all([
      tx.procurementLifecycleEvent.findUnique({ where: { idempotencyKey: eventKey }, select: { id: true } }),
      tx.materialRequest.findUnique({ where: { id: requestId }, include: { items: true } }),
    ]);
    if (!request) throw new ProcurementLifecycleError("Requisição de material não encontrada.");
    if (existingEvent) {
      for (const assignment of input.stockByItem.filter(item => item.settlementId)) {
        if (!await tx.materialMovement.count({ where: { materialRequestItemId: assignment.requestItemId, stockId: assignment.stockId, settlementId: assignment.settlementId } })) throw new ProcurementLifecycleError("Entrega já registrada com outra origem financeira; preserve os movimentos confirmados.");
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
      ? await tx.materialStock.findMany({
        where: { id: { in: stockIds } },
        select: { id: true, warehouseId: true, materialId: true, batchNumber: true, unitCost: true, blockedAt: true, expirationDate: true },
      })
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
    const claimed = await tx.materialRequest.updateMany({
      where: { id: request.id, status: { in: ["Aprovada", "Atendida Parcialmente"] } },
      data: { status: "Em atendimento" },
    });
    if (claimed.count !== 1) {
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
      await tx.materialRequestItem.update({ where: { id: item.id }, data: { quantityDelivered: { increment: quantityToIssue } } });
    }

    const issued = await tx.materialRequest.update({
      where: { id: request.id },
      data: { status: "Atendida", issuedByEmployeeId: issuerId, issuedAt: new Date() },
    });
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
