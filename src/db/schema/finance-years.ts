import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const financialYears = pgTable("FinancialYear", {
  id: text("id").primaryKey().$defaultFn(createId), year: integer("year").notNull(), governmentEntityId: text("governmentEntityId"),
  status: text("status").notNull().default("Preparação"), startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("FinancialYear_governmentEntityId_year_key").on(table.governmentEntityId, table.year), index("FinancialYear_year_status_idx").on(table.year, table.status)]);
