import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";

// RH read-only projections of canonical origins owned by SST. Never write here.
export const benefitPayrollInputs = pgTable("SstBenefitPayrollOrigin", {
  id: text("id").primaryKey(), entryId: text("entryId").notNull(), payrollItemId: text("payrollItemId").notNull(), functionalPeriodId: text("functionalPeriodId").notNull(), mappingId: text("mappingId"), rubricId: text("rubricId").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
export const leavePayrollInputs = pgTable("SstLeavePayrollOrigin", {
  id: text("id").primaryKey(), payrollItemId: text("payrollItemId").notNull(), rubricId: text("rubricId").notNull(), functionalPeriodId: text("functionalPeriodId").notNull(),
});
