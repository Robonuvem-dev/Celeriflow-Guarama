import { doublePrecision, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

export const expenses = pgTable("Expense", {
  id: text("id").primaryKey().$defaultFn(createId), date: timestamp("date", { precision: 3 }).notNull().defaultNow(),
  description: text("description").notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }),
  appropriationId: text("appropriationId").notNull(), secretariatId: text("secretariatId").notNull(), supplierId: text("supplierId"), requestedById: text("requestedById"),
  approvedById: text("approvedById"), approvedAt: timestamp("approvedAt", { precision: 3 }), status: text("status").notNull().default("Solicitada"),
  sourceModule: text("sourceModule").notNull().default("MANUAL"), sourceType: text("sourceType").notNull().default("EXPENSE_REQUEST"), sourceId: text("sourceId"),
  eventType: text("eventType").notNull().default("EXPENSE_REQUEST"), idempotencyKey: text("idempotencyKey"), purchaseReceiptId: text("purchaseReceiptId"),
  socialProgramId: text("socialProgramId"), socialBenefitId: text("socialBenefitId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Expense_idempotencyKey_key").on(table.idempotencyKey), uniqueIndex("Expense_purchaseReceiptId_key").on(table.purchaseReceiptId)]);
