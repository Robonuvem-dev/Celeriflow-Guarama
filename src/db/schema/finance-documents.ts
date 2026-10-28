import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const financialDocuments = pgTable("FinancialDocument", {
  id: text("id").primaryKey().$defaultFn(createId), documentType: text("documentType").notNull(), number: text("number").notNull(), title: text("title").notNull(), source: text("source").notNull().default("SYSTEM"), generatedByUsuarioId: text("generatedByUsuarioId").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), generatedAt: timestamp("generatedAt", { precision: 3 }).notNull().defaultNow(), commitmentId: text("commitmentId"), settlementId: text("settlementId"), paymentId: text("paymentId"), withholdingPayableId: text("withholdingPayableId"),
}, table => [uniqueIndex("FinancialDocument_number_key").on(table.number), uniqueIndex("FinancialDocument_commitmentId_key").on(table.commitmentId), uniqueIndex("FinancialDocument_settlementId_key").on(table.settlementId), uniqueIndex("FinancialDocument_paymentId_key").on(table.paymentId), uniqueIndex("FinancialDocument_withholdingPayableId_key").on(table.withholdingPayableId)]);
