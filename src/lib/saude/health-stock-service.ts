import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction as Tx } from "@/db/transaction";
import type { HealthPharmacyContext as AppContext } from "@/lib/contracts/health-pharmacy";
import { materials, materialCategories, materialStocks, materialMovements, warehouses } from "@/db/schema/assets-stock";
import { healthStockReceipts, healthStockReceiptItems, healthStockTransfers, healthStockTransferItems } from "@/db/schema/health-stock";
import { healthMaterialProfiles, pharmacyRequestItems, pharmacyRequestEvents } from "@/db/schema/health-pharmacy";
import { vaccines, healthVaccineManufacturers, healthVaccineLotProfiles, healthVaccineOpenedVials } from "@/db/schema/health-vaccination";
import { medicines } from "@/db/schema/health-prescriptions";
import { healthCatalogStockPolicies } from "@/db/schema/health-catalog-tools";
import { systemInstances, instanceParameters } from "@/db/schema/instance-configuration";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { parseHealthSusImport } from "./sus-import-contract";
import { assertPharmacyRequestTransfer, lockPharmacyRequestItem, recordPharmacyRequestFulfillment } from "./pharmacy-request-policy";

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
  const [warehouse] = await tx.select({ id: warehouses.id, healthUnitId: warehouses.healthUnitId }).from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.isActive, true))).limit(1);
  if (!warehouse?.healthUnitId) throw new HealthStockError("Estoque assistencial não encontrado ou sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  return { id: warehouse.id, unitId: warehouse.healthUnitId };
}

export async function postHealthStockReceipt(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = receiptSchema.parse(raw);
  if (input.entryType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "DOACAO" && !input.donorName) throw new HealthStockError("Informe o nome do doador.");
  const identities = input.items.map(item => `${item.materialId}\u0000${item.batchNumber}`);
  if (new Set(identities).size !== identities.length) throw new HealthStockError("Não repita o mesmo produto e lote na entrada.");
  if (input.items.some(item => item.productionDate && item.productionDate > item.expirationDate)) throw new HealthStockError("A validade não pode ser anterior à fabricação.");
  return withDatabaseTransaction(connection, async (tx) => {
    await scopedWarehouse(tx, context, input.warehouseId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existingRow] = await tx.select().from(healthStockReceipts).where(eq(healthStockReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    const existing = existingRow ? { ...existingRow, items: await tx.select().from(healthStockReceiptItems).where(eq(healthStockReceiptItems.receiptId, existingRow.id)) } : null;
    if (existing) {
      await scopedWarehouse(tx, context, existing.warehouseId);
      if (existing.warehouseId !== input.warehouseId || existing.entryType !== input.entryType || existing.supplierId !== (input.supplierId || null) || existing.invoiceNumber !== (input.invoiceNumber || null) || existing.donorName !== (input.donorName || null) || existing.items.length !== input.items.length || input.items.some(item => !existing.items.some(prior =>
        prior.materialId === item.materialId && prior.batchNumber === item.batchNumber && prior.quantity === item.quantity && prior.unitCost === item.unitCost && prior.expirationDate?.valueOf() === item.expirationDate.valueOf() && (prior.manufacturerName || null) === (item.manufacturerName || null) && prior.vaccineDosesPerVial === (item.vaccineDosesPerVial || null) && prior.vaccineManufacturerId === (item.vaccineManufacturerId || null)
      ))) throw new HealthStockError("Entrada já registrada com outros dados.");
      return { id: existing.id, status: existing.status };
    }
    const materialIds = [...new Set(input.items.map(item => item.materialId))];
    const activeMaterials = await tx.select({ id: materials.id }).from(materials).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).where(and(inArray(materials.id, materialIds), eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true)));
    if (activeMaterials.length !== materialIds.length) throw new HealthStockError("Selecione produtos assistenciais ativos.");
    for (const item of input.items) if (item.vaccineDosesPerVial) {
      if (!(await tx.select({ id: vaccines.id }).from(vaccines).where(and(eq(vaccines.materialId, item.materialId), eq(vaccines.isActive, true))).limit(1)).length) throw new HealthStockError("O metadado de doses por frasco exige produto imunobiológico ativo.");
      if (item.vaccineManufacturerId && !(await tx.select({ id: healthVaccineManufacturers.id }).from(healthVaccineManufacturers).where(and(eq(healthVaccineManufacturers.id, item.vaccineManufacturerId), eq(healthVaccineManufacturers.isActive, true))).limit(1)).length) throw new HealthStockError("Selecione fabricante ativo do imunobiológico.");
    }
    const [policy] = await tx.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, healthReceiptApprovalKey(input.warehouseId))).limit(1);
    const requiresApproval = policy?.valor && typeof policy.valor === "object" && !Array.isArray(policy.valor) && "approvalRequired" in policy.valor && policy.valor.approvalRequired === true;
    const [receiptRow] = await tx.insert(healthStockReceipts).values({
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
    }).returning();
    const receipt = { ...receiptRow, items: await tx.insert(healthStockReceiptItems).values(input.items.map(item => ({ ...item, receiptId: receiptRow.id }))).returning() };
    if (requiresApproval) return { id: receipt.id, status: receipt.status };
    return postReceiptItems(tx, context, receipt);
  }, { timeoutMs: 5_000 });
}

const healthReceiptApprovalKey = (warehouseId: string) => `HEALTH_STOCK_RECEIPT_APPROVAL:${warehouseId}`;

export async function configureHealthReceiptApproval(context: AppContext, warehouseId: string, approvalRequired: boolean, connection: DatabaseConnection = databaseConnection) {
  if (typeof approvalRequired !== "boolean") throw new HealthStockError("Informe a política de aprovação.");
  return withDatabaseTransaction(connection, async tx => {
    await scopedWarehouse(tx, context, warehouseId);
    const [instance] = await tx.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
    if (!instance) throw new HealthStockError("Configuração da instância não encontrada.");
    await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: healthReceiptApprovalKey(warehouseId), valor: { approvalRequired } }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: { approvalRequired } } });
    return { warehouseId, approvalRequired };
  }, { timeoutMs: 5_000 });
}

export async function approveHealthStockReceipt(context: AppContext, receiptId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthStockReceipt" WHERE id=${receiptId} FOR UPDATE`);
    const [row] = await tx.select().from(healthStockReceipts).where(eq(healthStockReceipts.id, receiptId)).limit(1);
    if (!row) throw new HealthStockError("Entrada não encontrada.");
    const receipt = { ...row, items: await tx.select().from(healthStockReceiptItems).where(eq(healthStockReceiptItems.receiptId, receiptId)) };
    await scopedWarehouse(tx, context, receipt.warehouseId);
    if (receipt.status === "POSTED") return { id: receipt.id, status: receipt.status };
    if (!["DRAFT", "PENDING_APPROVAL"].includes(receipt.status)) throw new HealthStockError("Somente entradas pendentes podem ser aprovadas.");
    if (receipt.items.some(item => !item.expirationDate)) throw new HealthStockError("Complete a validade dos lotes antes da aprovação.");
    await tx.update(healthStockReceipts).set({ approvedAt: new Date(), approvedByUsuarioId: context.user.id }).where(eq(healthStockReceipts.id, receipt.id));
    return postReceiptItems(tx, context, receipt);
  }, { timeoutMs: 5_000 });
}

async function postReceiptItems(tx: Tx, context: AppContext, receipt: typeof healthStockReceipts.$inferSelect & { items: Array<typeof healthStockReceiptItems.$inferSelect> }) {
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
      if (item.productionDate) await tx.update(materialStocks).set({ productionDate: item.productionDate }).where(eq(materialStocks.id, stock.id));
      if (item.vaccineDosesPerVial) {
        const [previous] = await tx.select().from(healthVaccineLotProfiles).where(eq(healthVaccineLotProfiles.stockId, stock.id)).limit(1);
        if (previous && (previous.dosesPerVial !== item.vaccineDosesPerVial || previous.manufacturerId && item.vaccineManufacturerId && previous.manufacturerId !== item.vaccineManufacturerId)) throw new HealthStockError("O lote já possui quantidade de doses/fabricante diferentes. Confira a identificação do lote.");
        await tx.insert(healthVaccineLotProfiles).values({ stockId: stock.id, dosesPerVial: item.vaccineDosesPerVial, manufacturerId: item.vaccineManufacturerId, manufacturerName: item.manufacturerName, actorUsuarioId: context.user.id }).onConflictDoUpdate({ target: healthVaccineLotProfiles.stockId, set: { manufacturerId: item.vaccineManufacturerId || undefined, manufacturerName: item.manufacturerName || undefined, actorUsuarioId: context.user.id } });
      }
      await tx.update(healthStockReceiptItems).set({ movementId: movement.id }).where(eq(healthStockReceiptItems.id, item.id));
    }
    return (await tx.update(healthStockReceipts).set({ status: "POSTED", postedAt: new Date() }).where(eq(healthStockReceipts.id, receipt.id)).returning({ id: healthStockReceipts.id, status: healthStockReceipts.status }))[0];
}

export async function dispatchHealthStockTransfer(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = transferSchema.parse(raw);
  if (input.originWarehouseId === input.destinationWarehouseId) throw new HealthStockError("Os estoques de origem e destino devem ser diferentes.");
  return withDatabaseTransaction(connection, async (tx) => {
    await scopedWarehouse(tx, context, input.originWarehouseId);
    await scopedWarehouse(tx, context, input.destinationWarehouseId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_TRANSFER:${input.idempotencyKey}`}))`);
    const [existingRow] = await tx.select().from(healthStockTransfers).where(eq(healthStockTransfers.idempotencyKey, input.idempotencyKey)).limit(1);
    const existing = existingRow ? { ...existingRow, items: await tx.select().from(healthStockTransferItems).where(eq(healthStockTransferItems.transferId, existingRow.id)) } : null;
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
    const references = grouped.size ? await tx.select({ requestId: pharmacyRequestItems.requestId }).from(pharmacyRequestItems).where(inArray(pharmacyRequestItems.id, [...grouped.keys()])) : [];
    for (const requestId of [...new Set(references.map(reference => reference.requestId))].sort()) await tx.execute(sql`SELECT id FROM "PharmacyRequest" WHERE id=${requestId} FOR UPDATE`);
    for (const [itemId, item] of grouped) await assertPharmacyRequestTransfer(tx, context, { itemId, originWarehouseId: input.originWarehouseId, destinationWarehouseId: input.destinationWarehouseId, materialId: item.materialId, quantity: item.quantity });
    const vaccineStocks = await tx.select({ id: materialStocks.id }).from(materialStocks).innerJoin(vaccines, eq(vaccines.materialId, materialStocks.materialId)).where(and(eq(materialStocks.warehouseId, input.originWarehouseId), inArray(materialStocks.materialId, input.items.map(item => item.materialId))));
    for (const stockId of vaccineStocks.map(stock => stock.id).sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${stockId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${input.originWarehouseId}`}))`);
    const [transferRow] = await tx.insert(healthStockTransfers).values({ originWarehouseId: input.originWarehouseId, destinationWarehouseId: input.destinationWarehouseId, requestNumber: input.requestNumber, notes: input.notes, idempotencyKey: input.idempotencyKey, status: "DRAFT", createdByUsuarioId: context.user.id }).returning();
    const transfer = { ...transferRow, items: await tx.insert(healthStockTransferItems).values(input.items.map(item => ({ ...item, transferId: transferRow.id }))).returning() };
    for (const item of transfer.items) {
      const [stockRow] = await tx.select({ stock: materialStocks, vaccine: { id: vaccines.id }, profile: healthVaccineLotProfiles }).from(materialStocks).leftJoin(vaccines, eq(vaccines.materialId, materialStocks.materialId)).leftJoin(healthVaccineLotProfiles, eq(healthVaccineLotProfiles.stockId, materialStocks.id)).where(and(eq(materialStocks.warehouseId, input.originWarehouseId), eq(materialStocks.materialId, item.materialId), eq(materialStocks.batchNumber, item.batchNumber))).limit(1);
      const stock = stockRow ? { ...stockRow.stock, material: { vaccine: stockRow.vaccine }, vaccineLotProfile: stockRow.profile } : null;
      if (!stock || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new HealthStockError("Lote de origem indisponível, bloqueado ou vencido.");
      if (stock.material.vaccine) {
        if (!stock.vaccineLotProfile || !Number.isInteger(item.quantity) || item.quantity % stock.vaccineLotProfile.dosesPerVial !== 0) throw new HealthStockError("Selecione quantidade de doses correspondente a frascos fechados completos e configure os dados do lote.");
        const [opened] = await tx.select({ remainingDoses: sql<number>`coalesce(sum(${healthVaccineOpenedVials.remainingDoses}),0)`.mapWith(Number) }).from(healthVaccineOpenedVials).where(eq(healthVaccineOpenedVials.stockId, stock.id));
        if (stock.quantity - opened.remainingDoses < item.quantity) throw new HealthStockError("O saldo solicitado inclui doses de frascos já abertos; selecione apenas frascos fechados para transferência.");
      }
      const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.originWarehouseId, materialId: item.materialId, batchNumber: item.batchNumber, quantity: item.quantity, reason: `TRANSFERENCIA_EM_TRANSITO:${transfer.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      await tx.update(healthStockTransferItems).set({ departureMovementId: movement.id, expirationDate: stock.expirationDate, vaccineDosesPerVial: stock.vaccineLotProfile?.dosesPerVial, vaccineManufacturerId: stock.vaccineLotProfile?.manufacturerId, vaccineManufacturerName: stock.vaccineLotProfile?.manufacturerName }).where(eq(healthStockTransferItems.id, item.id));
      if (item.pharmacyRequestItemId) {
        const requestItem = await lockPharmacyRequestItem(tx, context, item.pharmacyRequestItemId);
        await tx.insert(pharmacyRequestEvents).values({ requestId: requestItem.requestId, status: requestItem.request.status, reason: `Remessa em trânsito ${transfer.id}: ${item.quantity} unidade(s), lote ${item.batchNumber}`, actorUsuarioId: context.user.id });
      }
    }
    return (await tx.update(healthStockTransfers).set({ status: "IN_TRANSIT", dispatchedAt: new Date() }).where(eq(healthStockTransfers.id, transfer.id)).returning({ id: healthStockTransfers.id, status: healthStockTransfers.status }))[0];
  }, { timeoutMs: 5_000 });
}

export async function receiveHealthStockTransfer(context: AppContext, transferId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HealthStockTransfer" WHERE id=${transferId} FOR UPDATE`);
    const [row] = await tx.select().from(healthStockTransfers).where(eq(healthStockTransfers.id, transferId)).limit(1);
    if (!row) throw new HealthStockError("Transferência não encontrada.");
    const items = await tx.select({ item: healthStockTransferItems, departureMovement: { unitValue: materialMovements.unitValue } }).from(healthStockTransferItems).leftJoin(materialMovements, eq(materialMovements.id, healthStockTransferItems.departureMovementId)).where(eq(healthStockTransferItems.transferId, transferId));
    const transfer = { ...row, items: items.map(row => ({ ...row.item, departureMovement: row.departureMovement })) };
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
        const [previous] = await tx.select().from(healthVaccineLotProfiles).where(eq(healthVaccineLotProfiles.stockId, stock.id)).limit(1);
        if (previous && (previous.dosesPerVial !== item.vaccineDosesPerVial || previous.manufacturerId && item.vaccineManufacturerId && previous.manufacturerId !== item.vaccineManufacturerId)) throw new HealthStockError("Lote de destino possui doses por frasco ou fabricante diferentes da remessa.");
        await tx.insert(healthVaccineLotProfiles).values({ stockId: stock.id, dosesPerVial: item.vaccineDosesPerVial, manufacturerId: item.vaccineManufacturerId, manufacturerName: item.vaccineManufacturerName, actorUsuarioId: context.user.id }).onConflictDoUpdate({ target: healthVaccineLotProfiles.stockId, set: { manufacturerId: item.vaccineManufacturerId || undefined, manufacturerName: item.vaccineManufacturerName || undefined, actorUsuarioId: context.user.id } });
      }
      await tx.update(healthStockTransferItems).set({ arrivalMovementId: movement.id }).where(eq(healthStockTransferItems.id, item.id));
      if (item.pharmacyRequestItemId) await recordPharmacyRequestFulfillment(tx, context, { itemId: item.pharmacyRequestItemId, quantity: item.quantity, movementId: movement.id, transferItemId: item.id, reason: `Aceite da transferência ${transfer.id}` });
    }
    return (await tx.update(healthStockTransfers).set({ status: "RECEIVED", receivedAt: new Date(), receivedByUsuarioId: context.user.id }).where(eq(healthStockTransfers.id, transfer.id)).returning({ id: healthStockTransfers.id, status: healthStockTransfers.status }))[0];
  }, { timeoutMs: 5_000 });
}

export async function dispensePrescriptionItem(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const { dispenseElectronicPrescription } = await import("./pharmacy-dispensation-service");
  return dispenseElectronicPrescription(context, raw, connection);
}

// Carga de catálogo (RENAME e similares) pelo contrato controlado de
// importação (CSV/XML/TXT): codigo, nome, principio_ativo, concentracao,
// apresentacao, embalagem, dcb. Sem vínculo oficial declarado.
export async function importHealthProducts(context: AppContext, content: string, extension: string, connection: DatabaseConnection = databaseConnection) {
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
    await withDatabaseTransaction(connection, async tx => {
      const [existing] = await tx.select({ id: materials.id }).from(materials).where(eq(materials.code, code)).limit(1);
      let materialId: string;
      if (existing) {
        materialId = existing.id;
        await tx.insert(healthMaterialProfiles).values({ materialId, productKind: "MEDICINE", packaging, dcbCode: dcb }).onConflictDoUpdate({ target: healthMaterialProfiles.materialId, set: { packaging: packaging || undefined, dcbCode: dcb || undefined, isActive: true } });
        updated += 1;
      } else {
        const [category] = await tx.select({ id: materialCategories.id }).from(materialCategories).where(eq(materialCategories.isActive, true)).limit(1);
        if (!category) throw new HealthStockError("Cadastre ao menos um grupo de material antes da carga.");
        const [material] = await tx.insert(materials).values({ code, name, categoryId: category.id, unitOfMeasure: "UN", isPerishable: true }).returning({ id: materials.id });
        materialId = material.id;
        await tx.insert(healthMaterialProfiles).values({ materialId, productKind: "MEDICINE", packaging, dcbCode: dcb });
        created += 1;
      }
      const [linked] = await tx.select({ id: medicines.id }).from(medicines).where(and(sql`lower(${medicines.name}) = lower(${name})`, isNull(medicines.materialId))).limit(1);
      if (linked) await tx.update(medicines).set({ materialId, presentation: packaging, activePrinciple, concentration }).where(eq(medicines.id, linked.id));
      else if (!(await tx.select({ id: medicines.id }).from(medicines).where(eq(medicines.materialId, materialId)).limit(1)).length) await tx.insert(medicines).values({ name, materialId, presentation: packaging, activePrinciple, concentration });
    }, { timeoutMs: 5_000 });
  }
  return { created, updated, issues };
}

// Acerto/balanço: informa o saldo real por lote; a diferença vira
// ajuste auditável. Não gera compra.
export async function reconcileStockBalance(context: AppContext, input: { stockId: string; realQuantity: number; reason?: string | null }, connection: DatabaseConnection = databaseConnection) {
  if (!Number.isFinite(input.realQuantity) || input.realQuantity < 0) throw new HealthStockError("Informe o saldo real do lote.");
  return withDatabaseTransaction(connection, async tx => {
    const [stock] = await tx.select().from(materialStocks).where(eq(materialStocks.id, input.stockId)).limit(1);
    if (!stock) throw new HealthStockError("Lote não encontrado.");
    await scopedWarehouse(tx, context, stock.warehouseId);
    const diff = input.realQuantity - stock.quantity;
    if (diff === 0) return { id: stock.id, adjusted: 0 };
    await applyStockMovement(tx, { kind: "ADJUSTMENT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: diff, reason: `ACERTO_BALANCO:${(input.reason || "contagem").trim()}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    return { id: stock.id, adjusted: diff };
  }, { timeoutMs: 5_000 });
}

export async function saveStockPolicy(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ warehouseId: z.string().min(1), materialId: z.string().min(1), minQuantity: z.number().min(0), maxQuantity: z.number().min(0) }).strict().parse(raw);
  if (input.maxQuantity < input.minQuantity) throw new HealthStockError("O máximo não pode ser menor que o mínimo.");
  const db = context.database ?? connection.db;
  const [warehouse] = await db.select({ healthUnitId: warehouses.healthUnitId }).from(warehouses).where(eq(warehouses.id, input.warehouseId)).limit(1);
  if (!warehouse?.healthUnitId) throw new HealthStockError("Estoque assistencial inválido.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  return (await db.insert(healthCatalogStockPolicies).values(input).onConflictDoUpdate({ target: [healthCatalogStockPolicies.warehouseId, healthCatalogStockPolicies.materialId], set: { minQuantity: input.minQuantity, maxQuantity: input.maxQuantity, isActive: true } }).returning({ id: healthCatalogStockPolicies.id }))[0];
}

export async function writeOffHealthStock(context: AppContext, input: { stockId: string; quantity: number; reason: string }, connection: DatabaseConnection = databaseConnection) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.reason.trim().length < 3) throw new HealthStockError("Informe quantidade e motivo da baixa.");
  return withDatabaseTransaction(connection, async (tx) => {
    const [stock] = await tx.select().from(materialStocks).where(eq(materialStocks.id, input.stockId)).limit(1);
    if (!stock) throw new HealthStockError("Lote não encontrado.");
    await scopedWarehouse(tx, context, stock.warehouseId);
    return applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `BAIXA_ASSISTENCIAL:${input.reason.trim()}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
  }, { timeoutMs: 5_000 });
}
