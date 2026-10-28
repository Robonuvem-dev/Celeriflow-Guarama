"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { cancelPharmacyProductFulfillment, cancelPharmacyStockRequest, createPharmacyStockRequest, fulfillPatientPharmacyRequest } from "@/lib/saude/pharmacy-request-service";
import { dispatchHealthStockTransfer, receiveHealthStockTransfer } from "@/lib/saude/health-stock-service";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pharmacyRequestItems, pharmacyRequests } from "@/db/schema/health-pharmacy";
import { pharmacyRecord, readPharmacyStock } from "@/db/repositories/health-pharmacy/records";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
function refresh() { for (const path of ["/saude/farmacia/requisicoes", "/saude/farmacia", "/saude/farmacia/dispensacoes", "/saude/relatorios"]) revalidatePath(path); }
export async function createPharmacyRequestManagerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createPharmacyStockRequest(context, { idempotencyKey: text(data, "idempotencyKey"), patientId: text(data, "patientId") || null, destinationWarehouseId: text(data, "destinationWarehouseId"), originWarehouseId: text(data, "originWarehouseId") || null, notes: text(data, "notes") || null, items: JSON.parse(text(data, "items")) }); refresh();
}
export async function dispatchRequestedProductsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const row = pharmacyRecord((await database.select({ item: pharmacyRequestItems, request: pharmacyRequests }).from(pharmacyRequestItems).innerJoin(pharmacyRequests, eq(pharmacyRequests.id, pharmacyRequestItems.requestId)).where(eq(pharmacyRequestItems.id, text(data, "itemId"))).limit(1))[0]);
  const stock = await readPharmacyStock(database, text(data, "stockId"));
  await dispatchHealthStockTransfer(context, { originWarehouseId: stock.warehouseId, destinationWarehouseId: row.request.destinationWarehouseId, idempotencyKey: text(data, "idempotencyKey"), items: [{ pharmacyRequestItemId: row.item.id, materialId: row.item.materialId, batchNumber: stock.batchNumber, quantity: Number(text(data, "quantity")) }] }); refresh();
}
export async function receiveRequestedProductsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await receiveHealthStockTransfer(context, text(data, "transferId")); refresh();
}
export async function fulfillPharmacyDemandAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await fulfillPatientPharmacyRequest(context, { itemId: text(data, "itemId"), stockId: text(data, "stockId"), quantity: Number(text(data, "quantity")), prescriptionItemId: text(data, "prescriptionItemId") || null, prescriptionType: text(data, "prescriptionType") || "SIMPLE", prescriberProfessionalId: text(data, "prescriberProfessionalId") || null, dosage: text(data, "dosage"), receiverPersonId: text(data, "receiverPersonId") || null, receiverRelationship: text(data, "receiverRelationship") || null, idempotencyKey: text(data, "idempotencyKey") }); refresh();
}
export async function cancelPharmacyRequestManagerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await cancelPharmacyStockRequest(context, { requestId: text(data, "requestId"), reason: text(data, "reason") }); refresh();
}
export async function cancelPharmacyProductDeliveryAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await cancelPharmacyProductFulfillment(context, { fulfillmentId: text(data, "fulfillmentId"), reason: text(data, "reason") }); refresh();
}
