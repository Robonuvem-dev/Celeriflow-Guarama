import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

export const payableCarryForwards = pgTable("PayableCarryForward", {
  id: text("id").primaryKey().$defaultFn(createId), financialYearId: text("financialYearId").notNull(), originFinancialYearId: text("originFinancialYearId").notNull(), commitmentId: text("commitmentId").notNull(),
  previousPayableCarryForwardId: text("previousPayableCarryForwardId"), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(), type: text("type").notNull(), status: text("status").notNull().default("PENDENTE"), notes: text("notes"),
  bankTransactionId: text("bankTransactionId"), integrationEventId: text("integrationEventId"), paymentOrderExternalId: text("paymentOrderExternalId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("PayableCarryForward_previousPayableCarryForwardId_key").on(table.previousPayableCarryForwardId), uniqueIndex("PayableCarryForward_financialYearId_commitmentId_type_key").on(table.financialYearId, table.commitmentId, table.type), index("PayableCarryForward_originFinancialYearId_type_idx").on(table.originFinancialYearId, table.type), index("PayableCarryForward_status_idx").on(table.status), index("PayableCarryForward_bankTransactionId_idx").on(table.bankTransactionId)]);

export const payableCarryForwardSettlementLinks = pgTable("PayableCarryForwardSettlementLink", {
  id: text("id").primaryKey().$defaultFn(createId), payableCarryForwardId: text("payableCarryForwardId").notNull(), sourcePayableCarryForwardId: text("sourcePayableCarryForwardId").notNull(), settlementId: text("settlementId").notNull(), sourceFinancialYearId: text("sourceFinancialYearId").notNull(), transportAuditId: text("transportAuditId").notNull(),
  valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("ACTIVE"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("PayableCarryForwardSettlementLink_payableCarryForwardId_settlementId_key").on(table.payableCarryForwardId, table.settlementId), index("PayableCarryForwardSettlementLink_sourcePayableCarryForwardId_idx").on(table.sourcePayableCarryForwardId)]);

export const payableCarryForwardEvents = pgTable("PayableCarryForwardEvent", {
  id: text("id").primaryKey().$defaultFn(createId), payableCarryForwardId: text("payableCarryForwardId").notNull(), action: text("action").notNull(), justification: text("justification"), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), paymentId: text("paymentId"), settlementId: text("settlementId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("PayableCarryForwardEvent_payableCarryForwardId_createdAt_idx").on(table.payableCarryForwardId, table.createdAt), index("PayableCarryForwardEvent_actorUsuarioId_idx").on(table.actorUsuarioId), index("PayableCarryForwardEvent_paymentId_idx").on(table.paymentId), uniqueIndex("PayableCarryForwardEvent_payableCarryForwardId_paymentId_action_key").on(table.payableCarryForwardId, table.paymentId, table.action), uniqueIndex("PayableCarryForwardEvent_payableCarryForwardId_settlementId_action_key").on(table.payableCarryForwardId, table.settlementId, table.action)]);
