import { pgTable, text } from "drizzle-orm/pg-core";

/** SST's read projection of the shared financial unit. No DDL ownership. */
export const sstBudgetUnits = pgTable("BudgetUnit", {
  id: text("id").primaryKey(), name: text("name").notNull(), code: text("code").notNull(), secretariatId: text("secretariatId").notNull(),
});
