import { doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

// Existing historical tables; quantities/costs remain physical float8.
const id = () => text("id").primaryKey().$defaultFn(createId);
const time = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => time("createdAt").notNull().defaultNow();
const updatedAt = () => time("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const healthStockReceipts = pgTable("HealthStockReceipt", {
  id: id(), warehouseId: text("warehouseId").notNull(), supplierId: text("supplierId"), documentId: text("documentId"), entryType: text("entryType").notNull(), fundingSource: text("fundingSource"), invoiceNumber: text("invoiceNumber"), invoiceKey: text("invoiceKey"), invoiceXmlHash: text("invoiceXmlHash"), donorName: text("donorName"), invoiceIssuedAt: time("invoiceIssuedAt"), approvedAt: time("approvedAt"), approvedByUsuarioId: text("approvedByUsuarioId"), status: text("status").notNull().default("DRAFT"), idempotencyKey: text("idempotencyKey").notNull(), receivedAt: time("receivedAt").notNull().defaultNow(), postedAt: time("postedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthStockReceiptItems = pgTable("HealthStockReceiptItem", {
  id: id(), receiptId: text("receiptId").notNull(), materialId: text("materialId").notNull(), batchNumber: text("batchNumber").notNull(), productionDate: time("productionDate"), expirationDate: time("expirationDate"), manufacturerName: text("manufacturerName"), quantity: doublePrecision("quantity").notNull(), unitCost: doublePrecision("unitCost").notNull(), movementId: text("movementId"), vaccineDosesPerVial: integer("vaccineDosesPerVial"), vaccineManufacturerId: text("vaccineManufacturerId"), createdAt: createdAt(),
});
export const healthStockTransfers = pgTable("HealthStockTransfer", {
  id: id(), originWarehouseId: text("originWarehouseId").notNull(), destinationWarehouseId: text("destinationWarehouseId").notNull(), status: text("status").notNull().default("DRAFT"), requestNumber: text("requestNumber"), notes: text("notes"), idempotencyKey: text("idempotencyKey").notNull(), dispatchedAt: time("dispatchedAt"), receivedAt: time("receivedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), receivedByUsuarioId: text("receivedByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthStockTransferItems = pgTable("HealthStockTransferItem", {
  id: id(), transferId: text("transferId").notNull(), materialId: text("materialId").notNull(), batchNumber: text("batchNumber").notNull(), expirationDate: time("expirationDate"), quantity: doublePrecision("quantity").notNull(), departureMovementId: text("departureMovementId"), arrivalMovementId: text("arrivalMovementId"), vaccineDosesPerVial: integer("vaccineDosesPerVial"), vaccineManufacturerId: text("vaccineManufacturerId"), vaccineManufacturerName: text("vaccineManufacturerName"), pharmacyRequestItemId: text("pharmacyRequestItemId"), createdAt: createdAt(),
});
