import { date, doublePrecision, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

function timestamps() {
  return {
    id: text("id").primaryKey().$defaultFn(createId),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  };
}

export const purchaseRequests = pgTable("PurchaseRequest", {
  ...timestamps(), number: text("number").notNull(), object: text("object").notNull(), justification: text("justification").notNull(),
  estimatedValue: doublePrecision("estimatedValue"), status: text("status").notNull().default("Rascunho"), priority: text("priority").notNull().default("Normal"),
  secretariatId: text("secretariatId").notNull(), departmentId: text("departmentId").notNull(), requesterId: text("requesterId").notNull(),
  approvedByEmployeeId: text("approvedByEmployeeId"), approvedAt: timestamp("approvedAt", { precision: 3 }),
}, table => [uniqueIndex("PurchaseRequest_number_key").on(table.number)]);

export const purchaseRequestItems = pgTable("PurchaseRequestItem", {
  ...timestamps(), purchaseRequestId: text("purchaseRequestId").notNull(), catalogItemId: text("catalogItemId"), customName: text("customName"),
  quantity: doublePrecision("quantity").notNull(), estimatedUnitValue: doublePrecision("estimatedUnitValue"), materialId: text("materialId"),
});

export const purchaseRequestBudgetAllocations = pgTable("PurchaseRequestItemBudgetAllocation", {
  ...timestamps(), purchaseRequestItemId: text("purchaseRequestItemId").notNull(), budgetAppropriationId: text("budgetAppropriationId").notNull(),
  quantity: doublePrecision("quantity").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(),
}, table => [uniqueIndex("PurchaseRequestItemBudgetAllocation_purchaseRequestItemId_budgetAppropriationId_key").on(table.purchaseRequestItemId, table.budgetAppropriationId), index("PurchaseRequestItemBudgetAllocation_budgetAppropriationId_idx").on(table.budgetAppropriationId)]);

export const purchaseProcessRequestOrigins = pgTable("PurchaseProcessRequestOrigin", {
  ...timestamps(), purchaseProcessId: text("purchaseProcessId").notNull(), purchaseRequestId: text("purchaseRequestId").notNull(),
}, table => [uniqueIndex("PurchaseProcessRequestOrigin_purchaseProcessId_purchaseRequestId_key").on(table.purchaseProcessId, table.purchaseRequestId), index("PurchaseProcessRequestOrigin_purchaseRequestId_idx").on(table.purchaseRequestId)]);

export const purchaseProcessItemOrigins = pgTable("PurchaseProcessItemOrigin", {
  ...timestamps(), purchaseProcessItemId: text("purchaseProcessItemId").notNull(), purchaseRequestItemId: text("purchaseRequestItemId").notNull(), quantity: doublePrecision("quantity").notNull(),
}, table => [uniqueIndex("PurchaseProcessItemOrigin_purchaseProcessItemId_purchaseRequestItemId_key").on(table.purchaseProcessItemId, table.purchaseRequestItemId), index("PurchaseProcessItemOrigin_purchaseRequestItemId_idx").on(table.purchaseRequestItemId)]);

export const procurementLifecycleEvents = pgTable("ProcurementLifecycleEvent", {
  id: text("id").primaryKey().$defaultFn(createId), eventType: text("eventType").notNull(), entityType: text("entityType").notNull(), entityId: text("entityId").notNull(),
  sourceType: text("sourceType"), sourceId: text("sourceId"), actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("ProcurementLifecycleEvent_idempotencyKey_key").on(table.idempotencyKey), index("ProcurementLifecycleEvent_entityType_entityId_createdAt_idx").on(table.entityType, table.entityId, table.createdAt), index("ProcurementLifecycleEvent_sourceType_sourceId_idx").on(table.sourceType, table.sourceId)]);

export const purchaseReceipts = pgTable("PurchaseReceipt", {
  ...timestamps(), number: text("number").notNull(), receivedAt: timestamp("receivedAt", { precision: 3 }).notNull(), status: text("status").notNull().default("APPROVED"),
  contractId: text("contractId").notNull(), purchaseProcessId: text("purchaseProcessId").notNull(), documentId: text("documentId").notNull(),
  receiverId: text("receiverId").notNull(), attesterId: text("attesterId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), sourceType: text("sourceType").notNull().default("CONTRACT"), sourceId: text("sourceId").notNull(),
}, table => [uniqueIndex("PurchaseReceipt_number_key").on(table.number), uniqueIndex("PurchaseReceipt_idempotencyKey_key").on(table.idempotencyKey), index("PurchaseReceipt_purchaseProcessId_receivedAt_idx").on(table.purchaseProcessId, table.receivedAt), index("PurchaseReceipt_contractId_receivedAt_idx").on(table.contractId, table.receivedAt), index("PurchaseReceipt_sourceType_sourceId_idx").on(table.sourceType, table.sourceId)]);

export const purchaseReceiptItems = pgTable("PurchaseReceiptItem", {
  ...timestamps(), purchaseReceiptId: text("purchaseReceiptId").notNull(), purchaseProcessItemId: text("purchaseProcessItemId").notNull(), materialId: text("materialId").notNull(), warehouseId: text("warehouseId").notNull(),
  quantity: doublePrecision("quantity").notNull(), quantityIncorporated: doublePrecision("quantityIncorporated").notNull().default(0), unitCost: doublePrecision("unitCost").notNull(), batchNumber: text("batchNumber").notNull().default(""),
  expirationDate: timestamp("expirationDate", { precision: 3 }), brand: text("brand"), model: text("model"), serialNumber: text("serialNumber"), stockMovementId: text("stockMovementId").notNull(),
}, table => [uniqueIndex("PurchaseReceiptItem_stockMovementId_key").on(table.stockMovementId), index("PurchaseReceiptItem_purchaseProcessItemId_idx").on(table.purchaseProcessItemId), index("PurchaseReceiptItem_materialId_warehouseId_idx").on(table.materialId, table.warehouseId)]);

export const purchasePlannings = pgTable("PurchasePlanning", {
  ...timestamps(), description: text("description"), catalogItemId: text("catalogItemId"), originPurchaseRequestId: text("originPurchaseRequestId"), unit: text("unit").notNull(), quantity: doublePrecision("quantity").notNull(),
  expectedPeriodStart: date("expectedPeriodStart", { mode: "date" }).notNull(), expectedPeriodEnd: date("expectedPeriodEnd", { mode: "date" }).notNull(),
  estimatedValueDecimal: exactNumeric("estimatedValueDecimal", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("Rascunho"),
}, table => [index("PurchasePlanning_status_expectedPeriodStart_idx").on(table.status, table.expectedPeriodStart), index("PurchasePlanning_catalogItemId_idx").on(table.catalogItemId), index("PurchasePlanning_originPurchaseRequestId_idx").on(table.originPurchaseRequestId)]);
