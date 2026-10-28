import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Read-only missing columns, checked against the original installed catalog and
// baseline + pharmacy receipt migrations. Existing stock projections are reused.
export const pharmacyPageReceiptDetails = pgTable("HealthStockReceipt", {
  id: text("id").primaryKey(), entryType: text("entryType").notNull(), donorName: text("donorName"),
});
export const pharmacyPageReceiptItemDetails = pgTable("HealthStockReceiptItem", {
  id: text("id").primaryKey(), expirationDate: timestamp("expirationDate", { precision: 3 }), manufacturerName: text("manufacturerName"),
});
