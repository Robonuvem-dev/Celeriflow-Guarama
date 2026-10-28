import { boolean, doublePrecision, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

// Exclusive runtime projection; the 156 historical SQL migrations own the DDL.
// Stock policy quantities are physical float8, not numeric/Decimal.
export const healthCatalogStockPolicies = pgTable("HealthStockPolicy", {
  id: text("id").primaryKey().$defaultFn(createId),
  warehouseId: text("warehouseId").notNull(),
  materialId: text("materialId").notNull(),
  minQuantity: doublePrecision("minQuantity").notNull().default(0),
  maxQuantity: doublePrecision("maxQuantity").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("HealthStockPolicy_warehouseId_materialId_key").on(table.warehouseId, table.materialId)]);
