import { doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

// Existing SchoolMeal table, including its legacy Float cost contract.
export const schoolMeals = pgTable("SchoolMeal", {
  id: text("id").primaryKey().$defaultFn(createId), date: timestamp("date", { precision: 3 }).notNull().defaultNow(),
  menu: text("menu").notNull(), servedQuantity: integer("servedQuantity").notNull(), totalCost: doublePrecision("totalCost"), notes: text("notes"),
  schoolId: text("schoolId").notNull(), warehouseId: text("warehouseId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
