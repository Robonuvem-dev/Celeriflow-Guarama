import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

/** Read projections of the immutable accounting facts used by the MSC exporter. */
export const mscAccountingTransactions = pgTable("AccountingTransaction", {
  id: text("id").primaryKey(), financialYearId: text("financialYearId").notNull(),
  governmentEntityId: text("governmentEntityId"), budgetUnitId: text("budgetUnitId"),
  date: timestamp("date", { precision: 3 }).notNull(), status: text("status").notNull(), eventType: text("eventType").notNull(),
});

export const mscAccountingEntries = pgTable("AccountingEntry", {
  id: text("id").primaryKey(), transactionId: text("transactionId"), type: text("type").notNull(),
  valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), classificationSnapshot: jsonb("classificationSnapshot").$type<JsonValue>(),
});

export const mscAnnualCloses = pgTable("AnnualAccountingClose", {
  id: text("id").primaryKey(), financialYearId: text("financialYearId").notNull(), status: text("status").notNull(),
});
