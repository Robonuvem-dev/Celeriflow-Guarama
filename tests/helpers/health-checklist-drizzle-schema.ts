import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Only the missing approval projection. Physical nullable timestamp(3), no DDL.
export const checklistReceiptApprovals = pgTable("HealthStockReceipt", {
  id: text("id").primaryKey(),
  approvedByUsuarioId: text("approvedByUsuarioId"),
  approvedAt: timestamp("approvedAt", { precision: 3 }),
});
