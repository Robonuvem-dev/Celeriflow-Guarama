import { doublePrecision, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

const revenueStage = pgEnum("RevenueStage", ["LANCADA", "ARRECADADA", "ESTORNADA"]);
const revenueClassification = pgEnum("RevenueClassification", ["ORCAMENTARIA", "INTRAORCAMENTARIA", "REDUTORA"]);
const amount = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();

export const revenues = pgTable("Revenue", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), value: doublePrecision("value").notNull(), valueDecimal: amount("valueDecimal"),
  financialYearId: text("financialYearId"), budgetUnitId: text("budgetUnitId"), revenueNatureId: text("revenueNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(), bankAccountId: text("bankAccountId"), secretariatId: text("secretariatId"),
  status: text("status").notNull().default("Arrecadada"), stage: revenueStage("stage").notNull().default("ARRECADADA"), classification: revenueClassification("classification").notNull().default("ORCAMENTARIA"),
  launchDate: timestamp("launchDate", { precision: 3 }), collectionDate: timestamp("collectionDate", { precision: 3 }), reversedAt: timestamp("reversedAt", { precision: 3 }), history: text("history"),
  sourceModule: text("sourceModule").notNull().default("MANUAL"), sourceType: text("sourceType").notNull().default("REVENUE"), sourceId: text("sourceId"), eventType: text("eventType").notNull().default("REVENUE_CONFIRMED"),
  idempotencyKey: text("idempotencyKey"), integrationEventId: text("integrationEventId"), bankTransactionId: text("bankTransactionId"), bankAccountExternalId: text("bankAccountExternalId"), collectionReference: text("collectionReference"),
  createdAt: createdAt(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("Revenue_idempotencyKey_key").on(t.idempotencyKey)]);

export const revenueReversals = pgTable("RevenueReversal", {
  id: id(), revenueId: text("revenueId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), valueDecimal: amount("valueDecimal").notNull(), justification: text("justification").notNull(),
  financialYearId: text("financialYearId").notNull(), treasuryMovementId: text("treasuryMovementId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("RevenueReversal_revenueId_key").on(t.revenueId), uniqueIndex("RevenueReversal_treasuryMovementId_key").on(t.treasuryMovementId)]);

export const revenueRedistributions = pgTable("RevenueResourceRedistribution", {
  id: id(), revenueId: text("revenueId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), valueDecimal: amount("valueDecimal").notNull(), sourceResourceSourceId: text("sourceResourceSourceId").notNull(), destinationResourceSourceId: text("destinationResourceSourceId").notNull(),
  financialYearId: text("financialYearId").notNull(), history: text("history").notNull(), idempotencyKey: text("idempotencyKey"), createdAt: createdAt(),
}, t => [uniqueIndex("RevenueResourceRedistribution_idempotencyKey_key").on(t.idempotencyKey)]);

export const treasuryTransfers = pgTable("TreasuryTransfer", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), valueDecimal: amount("valueDecimal").notNull(), history: text("history"), sourceBankAccountId: text("sourceBankAccountId").notNull(), destinationBankAccountId: text("destinationBankAccountId").notNull(),
  sourceMovementId: text("sourceMovementId").notNull(), destinationMovementId: text("destinationMovementId").notNull(), idempotencyKey: text("idempotencyKey"), createdAt: createdAt(),
}, t => [uniqueIndex("TreasuryTransfer_idempotencyKey_key").on(t.idempotencyKey), uniqueIndex("TreasuryTransfer_sourceMovementId_key").on(t.sourceMovementId), uniqueIndex("TreasuryTransfer_destinationMovementId_key").on(t.destinationMovementId)]);

// Financial origin projection; tax execution remains owned by Tributação.
export const taxRevenueIntegrations = pgTable("TaxRevenueIntegrationEvent", {
  id: id(), taxPaymentId: text("taxPaymentId").notNull(), revenueId: text("revenueId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), status: text("status").notNull().default("Confirmado"), createdAt: createdAt(),
}, t => [uniqueIndex("TaxRevenueIntegrationEvent_taxPaymentId_key").on(t.taxPaymentId), uniqueIndex("TaxRevenueIntegrationEvent_revenueId_key").on(t.revenueId), uniqueIndex("TaxRevenueIntegrationEvent_idempotencyKey_key").on(t.idempotencyKey)]);
