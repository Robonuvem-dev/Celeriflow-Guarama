import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { parseHealthSusImport } from "./sus-import-contract";
import { assertPharmacyRequestTransfer, lockPharmacyRequestItem, recordPharmacyRequestFulfillment } from "./pharmacy-request-policy";

type Tx = Prisma.TransactionClient;

export class HealthStockError extends Error {}

const positive = z.number().positive();
const receiptSchema = z.object({
  warehouseId: z.string().min(1),
  supplierId: z.string().min(1).nullable().optional(),
  entryType: z.string().trim().min(2).max(60),
  fundingSource: z.string().trim().max(120).nullable().optional(),
  invoiceNumber: z.string().trim().max(60).nullable().optional(),
  invoiceKey: z.string().trim().max(60).nullable().optional(),
  invoiceXmlHash: z.string().trim().max(128).nullable().optional(),
  invoiceIssuedAt: z.coerce.date().nullable().optional(),
  donorName: z.string().trim().max(200).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
  items: z.array(z.object({
    materialId: z.string().min(1),
    batchNumber: z.string().trim().min(1).max(80),
    productionDate: z.coerce.date().nullable().optional(),
    expirationDate: z.preprocess(value => value === null || value === "" ? undefined : value, z.coerce.date()),
    manufacturerName: z.string().trim().max(200).nullable().optional(),
    vaccineDosesPerVial: z.number().int().positive().max(1000).nullable().optional(),
    vaccineManufacturerId: z.string().nullable().optional(),
    quantity: positive,
    unitCost: z.number().min(0),
  })).min(1),
}).strict();

const transferSchema = z.object({
  originWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  requestNumber: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
  items: z.array(z.object({
    pharmacyRequestItemId: z.string().nullable().optional(),
    materialId: z.string().min(1),
    batchNumber: z.string().trim().min(1).max(80),
    quantity: positive,
  })).min(1),
}).strict();

async function scopedWarehouse(tx: Tx, context: AppContext, warehouseId: string) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: warehouseId, isActive: true },
    select: { id: true, healthUnitId: true },
  });
  if (!warehouse?.healthUnitId) throw new HealthStockError("Estoque assistencial não encontrado ou sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  return { id: warehouse.id, unitId: warehouse.healthUnitId };
}

export async function postHealthStockReceipt(context: AppContext, raw: unknown) {
  const input = receiptSchema.parse(raw);
  if (input.entryType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "DOACAO" && !input.donorName) throw new HealthStockError("Informe o nome do doador.");
  const identities = input.items.map(item => `${item.materialId}\u0000${item.batchNumber}`);
  if (new Set(identities).size !== identities.length) throw new HealthStockError("Não repita o mesmo produto e lote na entrada.");
  if (input.items.some(item => item.productionDate && item.productionDate > item.expirationDate)) throw new HealthStockError("A validade não pode ser anterior à fabricação.");
  return context.prisma.$transaction(async (tx) => {
    await scopedWarehouse(tx, context, input.warehouseId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;
    const existing = await tx.healthStockReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
    if (existing) {
      await scopedWarehouse(tx, context, existing.warehouseId);
      if (existing.warehouseId !== input.warehouseId || existing.entryType !== input.entryType || existing.supplierId !== (input.supplierId || null) || existing.invoiceNumber !== (input.invoiceNumber || null) || existing.donorName !== (input.donorName || null) || existing.items.length !== input.items.length || input.items.some(item => !existing.items.some(prior =>
        prior.materialId === item.materialId && prior.batchNumber === item.batchNumber && prior.quantity === item.quantity && prior.unitCost === item.unitCost && prior.expirationDate?.valueOf() === item.expirationDate.valueOf() && (prior.manufacturerName || null) === (item.manufacturerName || null) && prior.vaccineDosesPerVial === (item.vaccineDosesPerVial || null) && prior.vaccineManufacturerId === (item.vaccineManufacturerId || null)
      ))) throw new HealthStockError("Entrada já registrada com outros dados.");
      return { id: existing.id, status: existing.status };
    }
    const materialIds = [...new Set(input.items.map(item => item.materialId))];
    if (await tx.material.count({ where: { id: { in: materialIds }, isActive: true, healthProfile: { isActive: true } } }) !== materialIds.length) throw new HealthStockError("Selecione produtos assistenciais ativos.");
    for (const item of input.items) if (item.vaccineDosesPerVial) {
      if (!await tx.vaccine.count({ where: { materialId: item.materialId, isActive: true } })) throw new HealthStockError("O metadado de doses por frasco exige produto imunobiológico ativo.");
      if (item.vaccineManufacturerId && !await tx.healthVaccineManufacturer.count({ where: { id: item.vaccineManufacturerId, isActive: true } })) throw new HealthStockError("Selecione fabricante ativo do imunobiológico.");
    }
    const policy = await tx.configuracaoParametroInstancia.findFirst({ where: { chave: healthReceiptApprovalKey(input.warehouseId) }, select: { valor: true } });
    const requiresApproval = policy?.valor && typeof policy.valor === "object" && !Array.isArray(policy.valor) && policy.valor.approvalRequired === true;
    const receipt = await tx.healthStockReceipt.create({
      data: {
        warehouseId: input.warehouseId,
        supplierId: input.supplierId,
        entryType: input.entryType,
        fundingSource: input.fundingSource,
        invoiceNumber: input.invoiceNumber,
        invoiceKey: input.invoiceKey,
        invoiceXmlHash: input.invoiceXmlHash,
        invoiceIssuedAt: input.invoiceIssuedAt,
        donorName: input.donorName || null,
        status: requiresApproval ? "PENDING_APPROVAL" : "DRAFT",
        idempotencyKey: input.idempotencyKey,
        createdByUsuarioId: context.user.id,
        items: { create: input.items },
      },
      include: { items: true },
    });
    if (requiresApproval) return { id: receipt.id, status: receipt.status };
    return postReceiptItems(tx, context, receipt);
  });
}

const healthReceiptApprovalKey = (warehouseId: string) => `HEALTH_STOCK_RECEIPT_APPROVAL:${warehouseId}`;

export async function configureHealthReceiptApproval(context: AppContext, warehouseId: string, approvalRequired: boolean) {
  if (typeof approvalRequired !== "boolean") throw new HealthStockError("Informe a política de aprovação.");
  return context.prisma.$transaction(async tx => {
    await scopedWarehouse(tx, context, warehouseId);
    const instance = await tx.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
    await tx.configuracaoParametroInstancia.upsert({ where: { configuracaoInstanciaId_chave: { configuracaoInstanciaId: instance.id, chave: healthReceiptApprovalKey(warehouseId) } }, create: { configuracaoInstanciaId: instance.id, chave: healthReceiptApprovalKey(warehouseId), valor: { approvalRequired } }, update: { valor: { approvalRequired } } });
    return { warehouseId, approvalRequired };
  });
}

export async function approveHealthStockReceipt(context: AppContext, receiptId: string) {
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthStockReceipt" WHERE id=${receiptId} FOR UPDATE`;
    const receipt = await tx.healthStockReceipt.findUnique({ where: { id: receiptId }, include: { items: true } });
    if (!receipt) throw new HealthStockError("Entrada não encontrada.");
    await scopedWarehouse(tx, context, receipt.warehouseId);
    if (receipt.status === "POSTED") return { id: receipt.id, status: receipt.status };
    if (!["DRAFT", "PENDING_APPROVAL"].includes(receipt.status)) throw new HealthStockError("Somente entradas pendentes podem ser aprovadas.");
    if (receipt.items.some(item => !item.expirationDate)) throw new HealthStockError("Complete a validade dos lotes antes da aprovação.");
    await tx.healthStockReceipt.update({ where: { id: receipt.id }, data: { approvedAt: new Date(), approvedByUsuarioId: context.user.id } });
    return postReceiptItems(tx, context, receipt);
  });
}

async function postReceiptItems(tx: Tx, context: AppContext, receipt: Prisma.HealthStockReceiptGetPayload<{ include: { items: true } }>) {
    for (const item of receipt.items) {
      const { movement, stock } = await applyStockMovement(tx, {
        kind: "ENTRY",
        sourceType: "HEALTH_RECEIPT",
        idempotencyKey: `HEALTH_RECEIPT_ITEM:${item.id}`,
        warehouseId: receipt.warehouseId,
        materialId: item.materialId,
        batchNumber: item.batchNumber,
        expirationDate: item.expirationDate,
        quantity: item.quantity,
        unitCost: item.unitCost,
        supplierId: receipt.supplierId,
        reason: `RECEBIMENTO_ASSISTENCIAL:${receipt.id}`,
        actor: { usuarioId: context.user.id, employeeId: context.user.employeeId },
      });
      if (item.productionDate) await tx.materialStock.update({ where: { id: stock.id }, data: { productionDate: item.productionDate } });
      if (item.vaccineDosesPerVial) {
        const previous = await tx.healthVaccineLotProfile.findUnique({ where: { stockId: stock.id } });
        if (previous && (previous.dosesPerVial !== item.vaccineDosesPerVial || previous.manufacturerId && item.vaccineManufacturerId && previous.manufacturerId !== item.vaccineManufacturerId)) throw new HealthStockError("O lote já possui quantidade de doses/fabricante diferentes. Confira a identificação do lote.");
        await tx.healthVaccineLotProfile.upsert({ where: { stockId: stock.id }, create: { stockId: stock.id, dosesPerVial: item.vaccineDosesPerVial, manufacturerId: item.vaccineManufacturerId, manufacturerName: item.manufacturerName, actorUsuarioId: context.user.id }, update: { manufacturerId: item.vaccineManufacturerId || undefined, manufacturerName: item.manufacturerName || undefined, actorUsuarioId: context.user.id } });
      }
      await tx.healthStockReceiptItem.update({ where: { id: item.id }, data: { movementId: movement.id } });
    }
    return tx.healthStockReceipt.update({ where: { id: receipt.id }, data: { status: "POSTED", postedAt: new Date() }, select: { id: true, status: true } });
}

export async function dispatchHealthStockTransfer(context: AppContext, raw: unknown) {
  const input = transferSchema.parse(raw);
  if (input.originWarehouseId === input.destinationWarehouseId) throw new HealthStockError("Os estoques de origem e destino devem ser diferentes.");
  return context.prisma.$transaction(async (tx) => {
    await scopedWarehouse(tx, context, input.originWarehouseId);
    await scopedWarehouse(tx, context, input.destinationWarehouseId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_TRANSFER:${input.idempotencyKey}`}))`;
    const existing = await tx.healthStockTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
    if (existing) {
      if (existing.originWarehouseId !== input.originWarehouseId || existing.destinationWarehouseId !== input.destinationWarehouseId || existing.items.length !== input.items.length || input.items.some(item => !existing.items.some(prior => prior.materialId === item.materialId && prior.batchNumber === item.batchNumber && prior.quantity === item.quantity && prior.pharmacyRequestItemId === (item.pharmacyRequestItemId || null)))) throw new HealthStockError("Transferência já registrada com outros dados.");
      return { id: existing.id, status: existing.status };
    }
    const grouped = new Map<string, { materialId: string; quantity: number }>();
    for (const item of input.items) if (item.pharmacyRequestItemId) {
      const prior = grouped.get(item.pharmacyRequestItemId);
      if (prior && prior.materialId !== item.materialId) throw new HealthStockError("Produto incompatível com o item requisitado.");
      grouped.set(item.pharmacyRequestItemId, { materialId: item.materialId, quantity: (prior?.quantity || 0) + item.quantity });
    }
    const references = grouped.size ? await tx.pharmacyRequestItem.findMany({ where: { id: { in: [...grouped.keys()] } }, select: { requestId: true } }) : [];
    for (const requestId of [...new Set(references.map(reference => reference.requestId))].sort()) await tx.$queryRaw`SELECT id FROM "PharmacyRequest" WHERE id=${requestId} FOR UPDATE`;
    for (const [itemId, item] of grouped) await assertPharmacyRequestTransfer(tx, context, { itemId, originWarehouseId: input.originWarehouseId, destinationWarehouseId: input.destinationWarehouseId, materialId: item.materialId, quantity: item.quantity });
    const vaccineStocks = await tx.materialStock.findMany({ where: { warehouseId: input.originWarehouseId, materialId: { in: input.items.map(item => item.materialId) }, material: { vaccine: { isNot: null } } }, select: { id: true } });
    for (const stockId of vaccineStocks.map(stock => stock.id).sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${stockId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${input.originWarehouseId}`}))`;
    const transfer = await tx.healthStockTransfer.create({
      data: { originWarehouseId: input.originWarehouseId, destinationWarehouseId: input.destinationWarehouseId, requestNumber: input.requestNumber, notes: input.notes, idempotencyKey: input.idempotencyKey, status: "DRAFT", createdByUsuarioId: context.user.id, items: { create: input.items } },
      include: { items: true },
    });
    for (const item of transfer.items) {
      const stock = await tx.materialStock.findUnique({
        where: { warehouseId_materialId_batchNumber: { warehouseId: input.originWarehouseId, materialId: item.materialId, batchNumber: item.batchNumber } },
        include: { material: { select: { vaccine: { select: { id: true } } } }, vaccineLotProfile: true },
      });
      if (!stock || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new HealthStockError("Lote de origem indisponível, bloqueado ou vencido.");
      if (stock.material.vaccine) {
        if (!stock.vaccineLotProfile || !Number.isInteger(item.quantity) || item.quantity % stock.vaccineLotProfile.dosesPerVial !== 0) throw new HealthStockError("Selecione quantidade de doses correspondente a frascos fechados completos e configure os dados do lote.");
        const opened = await tx.healthVaccineOpenedVial.aggregate({ where: { stockId: stock.id }, _sum: { remainingDoses: true } });
        if (stock.quantity - (opened._sum.remainingDoses || 0) < item.quantity) throw new HealthStockError("O saldo solicitado inclui doses de frascos já abertos; selecione apenas frascos fechados para transferência.");
      }
      const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.originWarehouseId, materialId: item.materialId, batchNumber: item.batchNumber, quantity: item.quantity, reason: `TRANSFERENCIA_EM_TRANSITO:${transfer.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      await tx.healthStockTransferItem.update({ where: { id: item.id }, data: { departureMovementId: movement.id, expirationDate: stock.expirationDate, vaccineDosesPerVial: stock.vaccineLotProfile?.dosesPerVial, vaccineManufacturerId: stock.vaccineLotProfile?.manufacturerId, vaccineManufacturerName: stock.vaccineLotProfile?.manufacturerName } });
      if (item.pharmacyRequestItemId) {
        const requestItem = await lockPharmacyRequestItem(tx, context, item.pharmacyRequestItemId);
        await tx.pharmacyRequestEvent.create({ data: { requestId: requestItem.requestId, status: requestItem.request.status, reason: `Remessa em trânsito ${transfer.id}: ${item.quantity} unidade(s), lote ${item.batchNumber}`, actorUsuarioId: context.user.id } });
      }
    }
    return tx.healthStockTransfer.update({ where: { id: transfer.id }, data: { status: "IN_TRANSIT", dispatchedAt: new Date() }, select: { id: true, status: true } });
  });
}

export async function receiveHealthStockTransfer(context: AppContext, transferId: string) {
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "HealthStockTransfer" WHERE id=${transferId} FOR UPDATE`;
    const transfer = await tx.healthStockTransfer.findUnique({ where: { id: transferId }, include: { items: { include: { departureMovement: { select: { unitValue: true } } } } } });
    if (!transfer) throw new HealthStockError("Transferência não encontrada.");
    await scopedWarehouse(tx, context, transfer.destinationWarehouseId);
    if (transfer.status === "RECEIVED") return { id: transfer.id, status: transfer.status };
    if (transfer.status !== "IN_TRANSIT") throw new HealthStockError("Somente transferências em trânsito podem ser recebidas.");
    for (const item of transfer.items) {
      if (item.pharmacyRequestItemId) {
        const requestItem = await lockPharmacyRequestItem(tx, context, item.pharmacyRequestItemId);
        if (requestItem.request.patientId || requestItem.request.status === "CANCELLED" || requestItem.request.destinationWarehouseId !== transfer.destinationWarehouseId || requestItem.materialId !== item.materialId) throw new HealthStockError("Aceite incompatível com a requisição de origem.");
      }
      const { movement, stock } = await applyStockMovement(tx, { kind: "ENTRY", sourceType: "STOCK_TRANSFER_RECEIPT", transferOriginMovementId: item.departureMovementId, warehouseId: transfer.destinationWarehouseId, materialId: item.materialId, batchNumber: item.batchNumber, expirationDate: item.expirationDate, quantity: item.quantity, unitCost: item.departureMovement?.unitValue, reason: `ACEITE_TRANSFERENCIA:${transfer.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      if (item.vaccineDosesPerVial) {
        const previous = await tx.healthVaccineLotProfile.findUnique({ where: { stockId: stock.id } });
        if (previous && (previous.dosesPerVial !== item.vaccineDosesPerVial || previous.manufacturerId && item.vaccineManufacturerId && previous.manufacturerId !== item.vaccineManufacturerId)) throw new HealthStockError("Lote de destino possui doses por frasco ou fabricante diferentes da remessa.");
        await tx.healthVaccineLotProfile.upsert({ where: { stockId: stock.id }, create: { stockId: stock.id, dosesPerVial: item.vaccineDosesPerVial, manufacturerId: item.vaccineManufacturerId, manufacturerName: item.vaccineManufacturerName, actorUsuarioId: context.user.id }, update: { manufacturerId: item.vaccineManufacturerId || undefined, manufacturerName: item.vaccineManufacturerName || undefined, actorUsuarioId: context.user.id } });
      }
      await tx.healthStockTransferItem.update({ where: { id: item.id }, data: { arrivalMovementId: movement.id } });
      if (item.pharmacyRequestItemId) await recordPharmacyRequestFulfillment(tx, context, { itemId: item.pharmacyRequestItemId, quantity: item.quantity, movementId: movement.id, transferItemId: item.id, reason: `Aceite da transferência ${transfer.id}` });
    }
    return tx.healthStockTransfer.update({ where: { id: transfer.id }, data: { status: "RECEIVED", receivedAt: new Date(), receivedByUsuarioId: context.user.id }, select: { id: true, status: true } });
  });
}

export async function dispensePrescriptionItem(context: AppContext, raw: unknown) {
  const { dispenseElectronicPrescription } = await import("./pharmacy-dispensation-service");
  return dispenseElectronicPrescription(context, raw);
}

// Carga de catálogo (RENAME e similares) pelo contrato controlado de
// importação (CSV/XML/TXT): codigo, nome, principio_ativo, concentracao,
// apresentacao, embalagem, dcb. Sem vínculo oficial declarado.
export async function importHealthProducts(context: AppContext, content: string, extension: string) {
  const records = parseHealthSusImport(content, extension);
  let created = 0; let updated = 0;
  const issues: Array<{ rowNumber: number; reason: string }> = [];
  const valueOf = (values: Record<string, string>, ...keys: string[]) => {
    const normalized = (key: string) => key.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    for (const key of keys) {
      const value = values[normalized(key)];
      if (value?.trim()) return value.trim();
    }
    return "";
  };
  for (const record of records) {
    const code = valueOf(record.values, "codigo", "codigo_produto");
    const name = valueOf(record.values, "nome", "descricao", "medicamento");
    if (!code || !name) { issues.push({ rowNumber: record.rowNumber, reason: "Informe código e nome do produto." }); continue; }
    const activePrinciple = valueOf(record.values, "principio_ativo", "principio") || null;
    const concentration = valueOf(record.values, "concentracao") || null;
    const packaging = valueOf(record.values, "apresentacao", "embalagem") || null;
    const dcb = valueOf(record.values, "dcb", "codigo_dcb") || null;
    await context.prisma.$transaction(async tx => {
      const existing = await tx.material.findUnique({ where: { code }, select: { id: true } });
      let materialId: string;
      if (existing) {
        materialId = existing.id;
        await tx.healthMaterialProfile.upsert({ where: { materialId }, create: { materialId, productKind: "MEDICINE", packaging, dcbCode: dcb }, update: { packaging: packaging || undefined, dcbCode: dcb || undefined, isActive: true } });
        updated += 1;
      } else {
        const category = await tx.materialCategory.findFirst({ where: { isActive: true }, select: { id: true } });
        if (!category) throw new HealthStockError("Cadastre ao menos um grupo de material antes da carga.");
        const material = await tx.material.create({ data: { code, name, categoryId: category.id, unitOfMeasure: "UN", isPerishable: true }, select: { id: true } });
        materialId = material.id;
        await tx.healthMaterialProfile.create({ data: { materialId, productKind: "MEDICINE", packaging, dcbCode: dcb } });
        created += 1;
      }
      const linked = await tx.medicine.findFirst({ where: { name: { equals: name, mode: "insensitive" }, materialId: null }, select: { id: true } });
      if (linked) await tx.medicine.update({ where: { id: linked.id }, data: { materialId, presentation: packaging, activePrinciple, concentration } });
      else if (!await tx.medicine.findFirst({ where: { materialId }, select: { id: true } })) await tx.medicine.create({ data: { name, materialId, presentation: packaging, activePrinciple, concentration } });
    });
  }
  return { created, updated, issues };
}

// Acerto/balanço: informa o saldo real por lote; a diferença vira
// ajuste auditável. Não gera compra.
export async function reconcileStockBalance(context: AppContext, input: { stockId: string; realQuantity: number; reason?: string | null }) {
  if (!Number.isFinite(input.realQuantity) || input.realQuantity < 0) throw new HealthStockError("Informe o saldo real do lote.");
  return context.prisma.$transaction(async tx => {
    const stock = await tx.materialStock.findUnique({ where: { id: input.stockId }, select: { id: true, quantity: true, warehouseId: true, materialId: true, batchNumber: true } });
    if (!stock) throw new HealthStockError("Lote não encontrado.");
    await scopedWarehouse(tx, context, stock.warehouseId);
    const diff = input.realQuantity - stock.quantity;
    if (diff === 0) return { id: stock.id, adjusted: 0 };
    await applyStockMovement(tx, { kind: "ADJUSTMENT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: diff, reason: `ACERTO_BALANCO:${(input.reason || "contagem").trim()}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    return { id: stock.id, adjusted: diff };
  });
}

export async function saveStockPolicy(context: AppContext, raw: unknown) {
  const input = z.object({ warehouseId: z.string().min(1), materialId: z.string().min(1), minQuantity: z.number().min(0), maxQuantity: z.number().min(0) }).strict().parse(raw);
  if (input.maxQuantity < input.minQuantity) throw new HealthStockError("O máximo não pode ser menor que o mínimo.");
  const warehouse = await context.prisma.warehouse.findUnique({ where: { id: input.warehouseId }, select: { healthUnitId: true } });
  if (!warehouse?.healthUnitId) throw new HealthStockError("Estoque assistencial inválido.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  return context.prisma.healthStockPolicy.upsert({ where: { warehouseId_materialId: { warehouseId: input.warehouseId, materialId: input.materialId } }, create: input, update: { minQuantity: input.minQuantity, maxQuantity: input.maxQuantity, isActive: true }, select: { id: true } });
}

export async function writeOffHealthStock(context: AppContext, input: { stockId: string; quantity: number; reason: string }) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.reason.trim().length < 3) throw new HealthStockError("Informe quantidade e motivo da baixa.");
  return context.prisma.$transaction(async (tx) => {
    const stock = await tx.materialStock.findUnique({ where: { id: input.stockId } });
    if (!stock) throw new HealthStockError("Lote não encontrado.");
    await scopedWarehouse(tx, context, stock.warehouseId);
    return applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `BAIXA_ASSISTENCIAL:${input.reason.trim()}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
  });
}
