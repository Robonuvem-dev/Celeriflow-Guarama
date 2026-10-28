import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

const timestamps = () => ({ id: text("id").primaryKey().$defaultFn(createId), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });

export const accountingPlans = pgTable("AccountingPlan", {
  ...timestamps(), code: text("code").notNull(), name: text("name").notNull(), type: text("type").notNull(),
}, table => [uniqueIndex("AccountingPlan_code_key").on(table.code)]);
export const accountingTransactions = pgTable("AccountingTransaction", {
  ...timestamps(), governmentEntityId: text("governmentEntityId"), budgetUnitId: text("budgetUnitId"), financialYearId: text("financialYearId").notNull(),
  date: timestamp("date", { precision: 3 }).notNull(), history: text("history").notNull(), status: text("status").notNull().default("RASCUNHO"),
  sourceModule: text("sourceModule").notNull().default("MANUAL"), sourceType: text("sourceType").notNull().default("ACCOUNTING_TRANSACTION"), sourceId: text("sourceId"), eventType: text("eventType").notNull().default("MANUAL_POSTING"),
  idempotencyKey: text("idempotencyKey"), authorUsuarioId: text("authorUsuarioId").notNull(), authorEmployeeId: text("authorEmployeeId"), postedAt: timestamp("postedAt", { precision: 3 }), reversalOfId: text("reversalOfId"),
}, table => [uniqueIndex("AccountingTransaction_idempotencyKey_key").on(table.idempotencyKey), uniqueIndex("AccountingTransaction_reversalOfId_key").on(table.reversalOfId)]);
export const accountingEntries = pgTable("AccountingEntry", {
  ...timestamps(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), classificationSnapshot: jsonb("classificationSnapshot").$type<JsonValue>(),
  type: text("type").notNull(), history: text("history").notNull(), accountId: text("accountId").notNull(), authorId: text("authorId").notNull(), transactionId: text("transactionId"),
});
export const accountingEvents = pgTable("AccountingEventCatalog", {
  ...timestamps(), code: text("code").notNull(), name: text("name").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true),
}, table => [uniqueIndex("AccountingEventCatalog_code_key").on(table.code)]);
export const accountingRules = pgTable("AccountingPostingRule", {
  ...timestamps(), eventId: text("eventId").notNull(), debitAccountId: text("debitAccountId").notNull(), creditAccountId: text("creditAccountId").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true), isReference: boolean("isReference").notNull().default(false),
}, table => [uniqueIndex("AccountingPostingRule_eventId_debitAccountId_creditAccountId_key").on(table.eventId, table.debitAccountId, table.creditAccountId)]);
export const accountingComponents = pgTable("AccountingPostingComponent", {
  id: text("id").primaryKey().$defaultFn(createId), ruleId: text("ruleId").notNull(), sequence: integer("sequence").notNull(), debitAccountId: text("debitAccountId").notNull(), creditAccountId: text("creditAccountId").notNull(), valueBasis: text("valueBasis").notNull().default("EVENT_VALUE"), creditFromOriginBank: boolean("creditFromOriginBank").notNull().default(false),
}, table => [uniqueIndex("AccountingPostingComponent_ruleId_sequence_key").on(table.ruleId, table.sequence)]);
export const monthlyAccountingCloses = pgTable("MonthlyAccountingClose", {
  ...timestamps(), financialYearId: text("financialYearId").notNull(), competence: timestamp("competence", { precision: 3 }).notNull(), status: text("status").notNull().default("ABERTO"), pendingSummary: jsonb("pendingSummary").$type<JsonValue>(),
  closedByUsuarioId: text("closedByUsuarioId"), closedByEmployeeId: text("closedByEmployeeId"), closedAt: timestamp("closedAt", { precision: 3 }),
}, table => [uniqueIndex("MonthlyAccountingClose_financialYearId_competence_key").on(table.financialYearId, table.competence)]);
export const monthlyAccountingCloseEvents = pgTable("MonthlyAccountingCloseEvent", {
  id: text("id").primaryKey().$defaultFn(createId), monthlyAccountingCloseId: text("monthlyAccountingCloseId").notNull(), action: text("action").notNull(), justification: text("justification"), pendingSummary: jsonb("pendingSummary").$type<JsonValue>(), closureEvidence: jsonb("closureEvidence").$type<JsonValue>(),
  requestedByUsuarioId: text("requestedByUsuarioId").notNull(), authorizedByUsuarioId: text("authorizedByUsuarioId"), requestedAt: timestamp("requestedAt", { precision: 3 }).notNull().defaultNow(), authorizedAt: timestamp("authorizedAt", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const annualAccountingCloses = pgTable("AnnualAccountingClose", {
  ...timestamps(), financialYearId: text("financialYearId").notNull(), status: text("status").notNull().default("EM_PREPARACAO"), pendingSummary: jsonb("pendingSummary").$type<JsonValue>(), preparedByUsuarioId: text("preparedByUsuarioId"), preparedAt: timestamp("preparedAt", { precision: 3 }),
  closedByUsuarioId: text("closedByUsuarioId"), closedByEmployeeId: text("closedByEmployeeId"), closedAt: timestamp("closedAt", { precision: 3 }),
}, table => [uniqueIndex("AnnualAccountingClose_financialYearId_key").on(table.financialYearId)]);
