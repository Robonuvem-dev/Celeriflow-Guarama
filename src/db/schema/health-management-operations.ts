import { boolean, date, doublePrecision, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Exclusive runtime projections. Original historical SQL owns DDL and guards.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const managementAdministrativeMerges = pgTable("HealthAdministrativeMerge", {
  id: id(), kind: text("kind").notNull(), targetId: text("targetId").notNull(), sourceIds: jsonb("sourceIds").$type<JsonValue>().notNull(), criteria: jsonb("criteria").$type<JsonValue>().notNull(), result: jsonb("result").$type<JsonValue>().notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const managementVigilanceEstablishments = pgTable("HealthVigilanceEstablishment", {
  id: id(), name: text("name").notNull(), document: text("document"), companyId: text("companyId"), personId: text("personId"), addressId: text("addressId"), cnae: text("cnae"), activity: text("activity"), riskLevel: text("riskLevel"), status: text("status").notNull().default("Ativo"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const managementVigilanceComplaints = pgTable("HealthVigilanceComplaint", {
  id: id(), establishmentId: text("establishmentId"), place: text("place"), description: text("description").notNull(), isAnonymous: boolean("isAnonymous").notNull().default(true), reporterPersonId: text("reporterPersonId"), status: text("status").notNull().default("Recebida"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const managementVigilanceInspections = pgTable("HealthVigilanceInspection", {
  id: id(), establishmentId: text("establishmentId").notNull(), complaintId: text("complaintId"), professionalId: text("professionalId"), inspectedAt: timestamp("inspectedAt", { precision: 3 }).notNull(), reason: text("reason"), findings: text("findings"), status: text("status").notNull().default("Agendada"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const managementVigilanceInspectionItems = pgTable("HealthVigilanceInspectionItem", {
  id: id(), inspectionId: text("inspectionId").notNull(), description: text("description").notNull(), result: text("result").notNull().default("Não avaliado"), notes: text("notes"),
});
export const managementVigilanceLicenses = pgTable("HealthVigilanceLicense", {
  id: id(), establishmentId: text("establishmentId").notNull(), licenseNumber: text("licenseNumber").notNull(), validFrom: date("validFrom", { mode: "date" }).notNull(), validUntil: date("validUntil", { mode: "date" }).notNull(), status: text("status").notNull().default("Válido"), documentId: text("documentId"), issuedByUsuarioId: text("issuedByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthVigilanceLicense_licenseNumber_key").on(t.licenseNumber)]);

// Read-only projections of stock sources owned by the pharmacy writer.
export const managementStockReceipts = pgTable("HealthStockReceipt", {
  id: text("id").primaryKey(), warehouseId: text("warehouseId").notNull(), supplierId: text("supplierId"), status: text("status").notNull(), receivedAt: timestamp("receivedAt", { precision: 3 }).notNull(), invoiceNumber: text("invoiceNumber"),
});
export const managementStockReceiptItems = pgTable("HealthStockReceiptItem", {
  id: text("id").primaryKey(), receiptId: text("receiptId").notNull(), materialId: text("materialId").notNull(), batchNumber: text("batchNumber").notNull(), quantity: doublePrecision("quantity").notNull(), unitCost: doublePrecision("unitCost").notNull(),
});
export const managementStockTransfers = pgTable("HealthStockTransfer", {
  id: text("id").primaryKey(), originWarehouseId: text("originWarehouseId").notNull(), destinationWarehouseId: text("destinationWarehouseId").notNull(), status: text("status").notNull(), requestNumber: text("requestNumber"), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
export const managementStockTransferItems = pgTable("HealthStockTransferItem", {
  id: text("id").primaryKey(), transferId: text("transferId").notNull(), materialId: text("materialId").notNull(), batchNumber: text("batchNumber").notNull(), quantity: doublePrecision("quantity").notNull(),
});
