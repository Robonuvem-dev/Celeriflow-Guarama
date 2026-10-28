import { boolean, doublePrecision, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

// Read-only projections for SSR. Historical SQL owns all DDL and write defaults.
const dateTime = (name: string) => timestamp(name, { precision: 3 });
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
const revenueStage = pgEnum("RevenueStage", ["LANCADA", "ARRECADADA", "ESTORNADA"]);
const revenueClassification = pgEnum("RevenueClassification", ["ORCAMENTARIA", "INTRAORCAMENTARIA", "REDUTORA"]);

export const financePageRevenues = pgTable("Revenue", {
  id: text("id").primaryKey(), date: dateTime("date").notNull(), value: doublePrecision("value").notNull(), valueDecimal: money("valueDecimal"),
  budgetUnitId: text("budgetUnitId"), revenueNatureId: text("revenueNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(),
  stage: revenueStage("stage").notNull(), classification: revenueClassification("classification").notNull(), history: text("history"), createdAt: dateTime("createdAt").notNull(),
});
export const financePageRevenueReversals = pgTable("RevenueReversal", { id: text("id").primaryKey(), revenueId: text("revenueId").notNull() });
export const financePageBankSources = pgTable("BankAccountResourceSource", {
  bankAccountId: text("bankAccountId").notNull(), resourceSourceId: text("resourceSourceId").notNull(), isActive: boolean("isActive").notNull(),
});
export const financePageTransfers = pgTable("TreasuryTransfer", {
  id: text("id").primaryKey(), date: dateTime("date").notNull(), valueDecimal: money("valueDecimal").notNull(), history: text("history"),
  sourceBankAccountId: text("sourceBankAccountId").notNull(), destinationBankAccountId: text("destinationBankAccountId").notNull(), createdAt: dateTime("createdAt").notNull(),
});
export const financePageCampaigns = pgTable("PublicityCampaign", {
  id: text("id").primaryKey(), name: text("name").notNull(), agency: text("agency").notNull(), status: text("status").notNull(),
  startDate: dateTime("startDate").notNull(), endDate: dateTime("endDate").notNull(),
});
export const financePageDebts = pgTable("FundedDebt", {
  id: text("id").primaryKey(), lawNumber: text("lawNumber").notNull(), creditorName: text("creditorName").notNull(), status: text("status").notNull(),
});
export const financePageCredits = pgTable("CreditRequest", {
  id: text("id").primaryKey(), number: text("number").notNull(), type: text("type").notNull(), justification: text("justification").notNull(),
  totalValue: money("totalValue").notNull(), status: text("status").notNull(), createdAt: dateTime("createdAt").notNull(),
});
export const financePageCreditItems = pgTable("CreditRequestItem", {
  id: text("id").primaryKey(), creditRequestId: text("creditRequestId").notNull(), appropriationId: text("appropriationId").notNull(),
});
export const financePagePersonnelDefinitions = pgTable("MunicipalPersonnelFiscalDefinition", {
  id: text("id").primaryKey(), financialYearId: text("financialYearId").notNull(), revision: integer("revision").notNull(), effectiveFrom: dateTime("effectiveFrom").notNull(),
  legalReference: text("legalReference").notNull(), legalLimit: exactNumeric("legalLimit", { precision: 9, scale: 4 }).notNull(),
  prudentialLimit: exactNumeric("prudentialLimit", { precision: 9, scale: 4 }).notNull(), alertLimit: exactNumeric("alertLimit", { precision: 9, scale: 4 }).notNull(),
  definition: jsonb("definition").$type<JsonValue>().notNull(),
});
