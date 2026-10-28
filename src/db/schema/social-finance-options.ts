import { doublePrecision, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";

// Read-only projections used by the Social catalog's finance selectors.
export const socialProcurementOriginPolicy = pgEnum("ProcurementOriginPolicy", ["NONE", "PROCUREMENT_SOURCE", "CONTRACT"]);
export const socialExpenseNatures = pgTable("ExpenseNature", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(), procurementOriginPolicy: socialProcurementOriginPolicy("procurementOriginPolicy").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull(),
});
export const socialBudgetAppropriations = pgTable("BudgetAppropriation", {
  id: text("id").primaryKey(), code: text("code").notNull(), financialYearId: text("financialYearId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), expenseNatureId: text("expenseNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(),
  annualBudgetExpenseFixationId: text("annualBudgetExpenseFixationId"), programPPAId: text("programPPAId"), actionPPAId: text("actionPPAId"),
  initialValue: doublePrecision("initialValue").notNull(), initialValueDecimal: exactNumeric("initialValueDecimal", { precision: 18, scale: 2 }),
  updatedValue: doublePrecision("updatedValue").notNull(), updatedValueDecimal: exactNumeric("updatedValueDecimal", { precision: 18, scale: 2 }),
  committedValue: doublePrecision("committedValue").notNull(), committedValueDecimal: exactNumeric("committedValueDecimal", { precision: 18, scale: 2 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull(),
});
