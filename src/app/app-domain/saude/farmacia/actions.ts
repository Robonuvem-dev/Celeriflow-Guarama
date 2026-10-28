"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { approveHealthStockReceipt, configureHealthReceiptApproval, dispatchHealthStockTransfer, dispensePrescriptionItem, HealthStockError, postHealthStockReceipt, receiveHealthStockTransfer, writeOffHealthStock } from "@/lib/saude/health-stock-service";
import { z } from "zod";
import { createPharmacyStockRequest } from "@/lib/saude/pharmacy-request-service";
import { executeConfiguredHealthHttp } from "@/lib/integrations/runtime";
import type { IntegrationOperation } from "@/lib/integrations/registry";
import { db, databaseConnection } from "@/db/client";
import { and, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { createId } from "@/db/ids";
import { withDatabaseTransaction } from "@/db/transaction";
import { materials, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { healthMaterialProfiles } from "@/db/schema/health-pharmacy";
import { medicines } from "@/db/schema/health-prescriptions";
import { vaccines } from "@/db/schema/health-vaccination";
import { healthUnits } from "@/db/schema/health-workforce";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();
const number = (data: FormData, name: string) => Number(data.get(name));

export async function saveHealthReceiptAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    const result = await postHealthStockReceipt(context, input);
    revalidatePath("/saude/farmacia"); revalidatePath("/patrimonio/materiais");
    return result;
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Revise os dados da entrada." : error instanceof HealthStockError ? error.message : "Não foi possível registrar a entrada." };
  }
}

export async function configureReceiptApprovalAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await configureHealthReceiptApproval(context, text(data, "warehouseId"), text(data, "approvalRequired") === "true");
  revalidatePath("/saude/farmacia");
}

export async function approveHealthReceiptAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await approveHealthStockReceipt(context, text(data, "receiptId"));
  revalidatePath("/saude/farmacia"); revalidatePath("/patrimonio/materiais");
}

export async function createHealthProductAction(data: FormData): Promise<void> {
  await getTenantContextForModuleOperation("SAUDE", "create");
  const kind = text(data, "productKind");
  const name = text(data, "name");
  if (!name || !["MEDICINE", "CONTROLLED", "MANIPULATED", "CORRELATE", "IMMUNOBIOLOGICAL", "SPECIALIZED", "DILUENT"].includes(kind)) throw new Error("Informe nome e tipo válidos.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [material] = await tx.insert(materials).values({ code: text(data, "code"), name, categoryId: text(data, "categoryId"), unitOfMeasure: text(data, "unitOfMeasure") || "UN", isPerishable: true }).returning({ id: materials.id });
    await tx.insert(healthMaterialProfiles).values({ materialId: material.id, productKind: kind, subgroup: text(data, "subgroup") || null, packaging: text(data, "packaging") || null, dcbCode: text(data, "dcbCode") || null, classification: text(data, "classification") || null, barcode: text(data, "barcode") || null });
    if (["MEDICINE", "CONTROLLED", "MANIPULATED"].includes(kind)) {
      const [existing] = await tx.select({ id: medicines.id }).from(medicines).where(and(sql`lower(${medicines.name}) = lower(${name})`, isNull(medicines.materialId))).limit(1);
      const values = { materialId: material.id, isControlled: kind === "CONTROLLED", presentation: text(data, "packaging") || null, activePrinciple: text(data, "activePrinciple") || null, concentration: text(data, "concentration") || null };
      if (existing) await tx.update(medicines).set(values).where(eq(medicines.id, existing.id));
      else await tx.insert(medicines).values({ name, ...values });
    }
    if (kind === "IMMUNOBIOLOGICAL") {
      const [existing] = await tx.select({ id: vaccines.id }).from(vaccines).where(and(sql`lower(${vaccines.name}) = lower(${name})`, isNull(vaccines.materialId))).limit(1);
      if (existing) await tx.update(vaccines).set({ materialId: material.id }).where(eq(vaccines.id, existing.id));
      else await tx.insert(vaccines).values({ name, materialId: material.id });
    }
  });
  revalidatePath("/saude/farmacia");
  revalidatePath("/saude/vacinacao");
}

export async function createHealthWarehouseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const unitId = text(data, "healthUnitId");
  const [unit] = await database.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, unitId), eq(healthUnits.isActive, true))).limit(1);
  if (!unit) throw new Error("Unidade de saúde ativa não encontrada.");
  assertHealthUnitAccess(context.user, unit.id);
  await database.insert(warehouses).values({ name: text(data, "name"), type: "Assistencial", healthUnitId: unit.id });
  revalidatePath("/saude/farmacia");
}

export async function dispatchPharmacyIntegrationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const database = context.database ?? db;
  const code = text(data, "code");
  const operations: Record<string, IntegrationOperation> = { HORUS: "EXPORT_HORUS", SIGAF: "EXPORT_SIGAF", TRANSPARENCIA_SAUDE: "EXPORT_HEALTH_STOCK_TRANSPARENCY" };
  const operation = operations[code];
  if (!operation) throw new Error("Conector farmacêutico inválido.");
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const stockRows = await database.select({ quantity: materialStocks.quantity, batchNumber: materialStocks.batchNumber, expirationDate: materialStocks.expirationDate, material: { code: materials.code, name: materials.name }, warehouseName: warehouses.name, healthUnit: { cnes: healthUnits.cnes } }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).leftJoin(healthUnits, eq(healthUnits.id, warehouses.healthUnitId)).where(and(gt(materialStocks.quantity, 0), eq(healthMaterialProfiles.isActive, true), unitIds ? inArray(warehouses.healthUnitId, unitIds) : isNotNull(warehouses.healthUnitId)));
  const stocks = stockRows.map(({ warehouseName, healthUnit, ...row }) => ({ ...row, warehouse: { name: warehouseName, healthUnit } }));
  const payload = code === "TRANSPARENCIA_SAUDE" ? stocks.map(({ material, warehouse, quantity }) => ({ productCode: material.code, productName: material.name, unit: warehouse.name, quantity })) : stocks;
  await executeConfiguredHealthHttp(database, { code, operation, payload: { generatedAt: new Date().toISOString(), stocks: payload } });
  revalidatePath("/saude/farmacia");
}

export async function saveMedicineInteractionAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const originMedicineId = text(data, "originMedicineId"); const targetMedicineId = text(data, "targetMedicineId");
  if (originMedicineId === targetMedicineId) throw new Error("Selecione medicamentos diferentes.");
  await (context.database ?? db).execute(sql`INSERT INTO "MedicineInteraction" (id,"originMedicineId","targetMedicineId",description,severity,source,"updatedAt") VALUES (${createId()},${originMedicineId},${targetMedicineId},${text(data, "description")},${text(data, "severity") || null},${text(data, "source")},CURRENT_TIMESTAMP) ON CONFLICT ("originMedicineId","targetMedicineId") DO UPDATE SET description=EXCLUDED.description,severity=EXCLUDED.severity,source=EXCLUDED.source,"isActive"=true,"updatedAt"=CURRENT_TIMESTAMP`);
  revalidatePath("/saude/farmacia");
}

export async function saveDosageTemplateAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const medicineId = text(data, "medicineId"); const name = text(data, "name");
  await (context.database ?? db).execute(sql`INSERT INTO "MedicineDosageTemplate" (id,"medicineId",name,dose,route,frequency,duration,instructions,"updatedAt") VALUES (${createId()},${medicineId},${name},${text(data, "dose")},${text(data, "route") || null},${text(data, "frequency")},${text(data, "duration") || null},${text(data, "instructions") || null},CURRENT_TIMESTAMP) ON CONFLICT ("medicineId",name) DO UPDATE SET dose=EXCLUDED.dose,route=EXCLUDED.route,frequency=EXCLUDED.frequency,duration=EXCLUDED.duration,instructions=EXCLUDED.instructions,"isActive"=true,"updatedAt"=CURRENT_TIMESTAMP`);
  revalidatePath("/saude/farmacia");
}

export async function createPharmacyRequestAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createPharmacyStockRequest(context, { idempotencyKey: text(data, "idempotencyKey") || randomUUID(), patientId: text(data, "patientId") || null, destinationWarehouseId: text(data, "destinationWarehouseId"), originWarehouseId: text(data, "originWarehouseId") || null, notes: text(data, "notes") || null, items: [{ materialId: text(data, "materialId"), quantity: number(data, "quantity") }] });
  revalidatePath("/saude/farmacia");
}

export async function setStockBlockAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const database = context.database ?? db;
  const stockId = text(data, "stockId"); const blocked = text(data, "blocked") === "true"; const reason = text(data, "reason");
  if (blocked && reason.length < 3) throw new Error("Informe o motivo do bloqueio.");
  const [stock] = await database.select({ healthUnitId: warehouses.healthUnitId }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(eq(materialStocks.id, stockId)).limit(1);
  if (!stock?.healthUnitId) throw new Error("Lote assistencial inválido.");
  assertHealthUnitAccess(context.user, stock.healthUnitId);
  await database.update(materialStocks).set({ blockedAt: blocked ? new Date() : null, blockReason: blocked ? reason : null }).where(eq(materialStocks.id, stockId));
  revalidatePath("/saude/farmacia");
}

export async function toggleControlledBookAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const database = context.database ?? db;
  const warehouseId = text(data, "warehouseId"); const period = text(data, "period"); const close = text(data, "close") === "true";
  const [warehouse] = await database.select({ healthUnitId: warehouses.healthUnitId }).from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!warehouse?.healthUnitId) throw new Error("Estoque assistencial inválido.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  await database.execute(sql`INSERT INTO "ControlledMedicineBook" (id,"warehouseId",period,"openedByUsuarioId","updatedAt") VALUES (${createId()},${warehouseId},${period},${context.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("warehouseId",period) DO NOTHING`);
  if (close) await database.execute(sql`UPDATE "ControlledMedicineBook" SET status='CLOSED',"closedAt"=CURRENT_TIMESTAMP,"closedByUsuarioId"=${context.user.id},"closingEvidence"=${text(data, "closingEvidence") || null},"updatedAt"=CURRENT_TIMESTAMP WHERE "warehouseId"=${warehouseId} AND period=${period}`);
  revalidatePath("/saude/farmacia");
}

export async function receiveStockAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await postHealthStockReceipt(context, { warehouseId: text(data, "warehouseId"), supplierId: text(data, "supplierId") || null, entryType: text(data, "entryType"), fundingSource: text(data, "fundingSource") || null, invoiceNumber: text(data, "invoiceNumber") || null, invoiceKey: text(data, "invoiceKey") || null, idempotencyKey: randomUUID(), items: [{ materialId: text(data, "materialId"), batchNumber: text(data, "batchNumber"), productionDate: text(data, "productionDate") || null, expirationDate: text(data, "expirationDate") || null, quantity: number(data, "quantity"), unitCost: number(data, "unitCost") }] });
  revalidatePath("/saude/farmacia");
}

export async function dispenseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await dispensePrescriptionItem(context, { prescriptionItemId: text(data, "prescriptionItemId"), warehouseId: text(data, "warehouseId"), quantity: number(data, "quantity"), batchNumber: text(data, "batchNumber") || null, observation: text(data, "observation") || null, nextWithdrawalAt: text(data, "nextWithdrawalAt") || null, idempotencyKey: randomUUID() });
  revalidatePath("/saude/farmacia");
}

export async function dispatchTransferAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await dispatchHealthStockTransfer(context, { originWarehouseId: text(data, "originWarehouseId"), destinationWarehouseId: text(data, "destinationWarehouseId"), requestNumber: text(data, "requestNumber") || null, notes: text(data, "notes") || null, idempotencyKey: randomUUID(), items: [{ materialId: text(data, "materialId"), batchNumber: text(data, "batchNumber"), quantity: number(data, "quantity") }] });
  revalidatePath("/saude/farmacia");
}

export async function receiveTransferAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await receiveHealthStockTransfer(context, text(data, "transferId"));
  revalidatePath("/saude/farmacia");
}

export async function writeOffAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await writeOffHealthStock(context, { stockId: text(data, "stockId"), quantity: number(data, "quantity"), reason: text(data, "reason") });
  revalidatePath("/saude/farmacia");
}
