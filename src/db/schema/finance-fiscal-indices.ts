import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const municipalFiscalIndexDefinitions = pgTable("MunicipalFiscalIndexDefinition", {
  id: text("id").primaryKey().$defaultFn(createId), financialYearId: text("financialYearId").notNull(), code: text("code").notNull(), revision: integer("revision").notNull(),
  legalReference: text("legalReference").notNull(), minimumPercentage: exactNumeric("minimumPercentage", { precision: 9, scale: 4 }).notNull(),
  effectiveFrom: date("effectiveFrom", { mode: "date" }).notNull(), definition: jsonb("definition").$type<JsonValue>().notNull(), reason: text("reason").notNull(),
  actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("MunicipalFiscalIndexDefinition_financialYearId_code_revision_key").on(table.financialYearId, table.code, table.revision), index("MunicipalFiscalIndexDefinition_scope").on(table.financialYearId, table.code, table.effectiveFrom)]);

// Read projections of accounting facts. Float values deliberately do not enter fiscal calculations.
export const fiscalAccountingTransactions = pgTable("AccountingTransaction", {
  id: text("id").primaryKey(), financialYearId: text("financialYearId").notNull(), governmentEntityId: text("governmentEntityId"), budgetUnitId: text("budgetUnitId"),
  date: timestamp("date", { precision: 3 }).notNull(), status: text("status").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId"), reversalOfId: text("reversalOfId"),
});
export const fiscalAccountingEntries = pgTable("AccountingEntry", {
  id: text("id").primaryKey(), accountId: text("accountId").notNull(), transactionId: text("transactionId"), type: text("type").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }),
});
export const fiscalMonthlyCloses = pgTable("MonthlyAccountingClose", {
  id: text("id").primaryKey(), financialYearId: text("financialYearId").notNull(), competence: timestamp("competence", { precision: 3 }).notNull(), status: text("status").notNull(),
});
