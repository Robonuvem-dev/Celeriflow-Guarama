import { pgTable, text } from "drizzle-orm/pg-core";

// Read-only projections of Finance-owned tables. No DDL is generated here.
export const procurementAppropriations = pgTable("BudgetAppropriation", {
  id: text("id").primaryKey(), code: text("code").notNull(), budgetUnitId: text("budgetUnitId").notNull(), financialYearId: text("financialYearId").notNull(),
  expenseNatureId: text("expenseNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(),
});
export const procurementUnits = pgTable("BudgetUnit", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(), secretariatId: text("secretariatId").notNull(),
});
export const procurementExpenseNatures = pgTable("ExpenseNature", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
});
export const procurementResourceSources = pgTable("ResourceSource", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
});
