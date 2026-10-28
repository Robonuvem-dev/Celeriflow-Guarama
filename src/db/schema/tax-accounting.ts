import { boolean, doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { documents, taxpayers } from "./registry";
import { taxAssessments, taxGuides, taxes } from "./taxation-core";
import { reconciliationBankAccounts } from "./finance-reconciliation";
import { planningBudgetUnitLabels } from "./planning-catalog";
import { planningResourceSources, planningRevenueNatures } from "./planning-legal";
import { governmentEntities } from "./master-data";

// Installed objects only: catalog.json (2026-10-28) and historical SQL remain
// authoritative. No schema generation or DDL is performed by these mappings.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });

export const taxPayments = pgTable("TaxPayment", {
  id: id(), amountPaid: doublePrecision("amountPaid").notNull(), amountPaidDecimal: money("amountPaidDecimal"), status: text("status").notNull().default("Confirmado"),
  idempotencyKey: text("idempotencyKey"), sourceModule: text("sourceModule").notNull().default("TRIBUTARIO"), sourceType: text("sourceType").notNull().default("TAX_PAYMENT"), sourceId: text("sourceId"), eventType: text("eventType").notNull().default("TAX_PAYMENT_CONFIRMED"),
  proofDocumentId: text("proofDocumentId"), paymentDate: timestamp("paymentDate", { precision: 3 }).notNull(), clearanceDate: timestamp("clearanceDate", { precision: 3 }).notNull().defaultNow(), paymentMethod: text("paymentMethod").notNull(),
  guideId: text("guideId").notNull(), bankAccountId: text("bankAccountId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("TaxPayment_idempotencyKey_key").on(t.idempotencyKey),
  foreignKey({ name: "TaxPayment_proofDocumentId_fkey", columns: [t.proofDocumentId], foreignColumns: [documents.id] }).onDelete("set null").onUpdate("cascade"),
  foreignKey({ name: "TaxPayment_guideId_fkey", columns: [t.guideId], foreignColumns: [taxGuides.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "TaxPayment_bankAccountId_fkey", columns: [t.bankAccountId], foreignColumns: [reconciliationBankAccounts.id] }).onDelete("set null").onUpdate("cascade"),
]);

export const taxIntegrationEvents = pgTable("TaxIntegrationEvent", {
  id: id(), integrationCode: text("integrationCode").notNull(), eventType: text("eventType").notNull(), idempotencyKey: text("idempotencyKey").notNull(), protocol: text("protocol"), externalReference: text("externalReference"), status: text("status").notNull().default("RECEBIDO"), evidenceLevel: text("evidenceLevel").notNull().default("L0"),
  payload: jsonb("payload").$type<JsonValue>().notNull(), result: jsonb("result").$type<JsonValue>(), taxpayerId: text("taxpayerId"), economicRegistrationId: text("economicRegistrationId"), receivedAt: timestamp("receivedAt", { precision: 3 }).notNull().defaultNow(), processedAt: timestamp("processedAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxIntegrationEvent_idempotencyKey_key").on(t.idempotencyKey), index("TaxIntegrationEvent_integrationCode_eventType_status_idx").on(t.integrationCode, t.eventType, t.status), index("TaxIntegrationEvent_taxpayerId_idx").on(t.taxpayerId), index("TaxIntegrationEvent_economicRegistrationId_idx").on(t.economicRegistrationId), index("TaxIntegrationEvent_receivedAt_idx").on(t.receivedAt)]);

export const taxActiveDebts = pgTable("ActiveDebt", {
  id: id(), originDebtType: text("originDebtType").notNull(), year: integer("year").notNull(), originalValue: doublePrecision("originalValue").notNull(), originalValueDecimal: money("originalValueDecimal"), updatedValue: doublePrecision("updatedValue").notNull(), updatedValueDecimal: money("updatedValueDecimal"), cdaNumber: text("cdaNumber"), sourceKey: text("sourceKey"), status: text("status").notNull().default("Inscrita"), taxpayerId: text("taxpayerId").notNull(),
  assessmentId: text("assessmentId"), bankTransactionId: text("bankTransactionId"), integrationEventId: text("integrationEventId"), collectionReference: text("collectionReference"), createdAt: createdAt(), updatedAt: updatedAt(),
  budgetUnitId: text("budgetUnitId"), governmentEntityId: text("governmentEntityId"),
}, t => [
  uniqueIndex("ActiveDebt_assessmentId_key").on(t.assessmentId), uniqueIndex("ActiveDebt_cdaNumber_key").on(t.cdaNumber), uniqueIndex("ActiveDebt_sourceKey_key").on(t.sourceKey), index("ActiveDebt_budgetUnitId_year_status_idx").on(t.budgetUnitId, t.year, t.status), index("ActiveDebt_governmentEntityId_year_status_idx").on(t.governmentEntityId, t.year, t.status),
  foreignKey({ name: "ActiveDebt_taxpayerId_fkey", columns: [t.taxpayerId], foreignColumns: [taxpayers.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "ActiveDebt_assessmentId_fkey", columns: [t.assessmentId], foreignColumns: [taxAssessments.id] }).onDelete("set null").onUpdate("cascade"),
  foreignKey({ name: "ActiveDebt_budgetUnitId_fkey", columns: [t.budgetUnitId], foreignColumns: [planningBudgetUnitLabels.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "ActiveDebt_governmentEntityId_fkey", columns: [t.governmentEntityId], foreignColumns: [governmentEntities.id] }).onDelete("restrict").onUpdate("cascade"),
]);

export const taxDebtInstallments = pgTable("DebtInstallment", {
  id: id(), totalValue: doublePrecision("totalValue").notNull(), totalValueDecimal: money("totalValueDecimal"), downPayment: doublePrecision("downPayment"), downPaymentDecimal: money("downPaymentDecimal"), installmentsCount: integer("installmentsCount").notNull(), status: text("status").notNull().default("Ativo"), taxpayerId: text("taxpayerId").notNull(), activeDebtId: text("activeDebtId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  foreignKey({ name: "DebtInstallment_taxpayerId_fkey", columns: [t.taxpayerId], foreignColumns: [taxpayers.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "DebtInstallment_activeDebtId_fkey", columns: [t.activeDebtId], foreignColumns: [taxActiveDebts.id] }).onDelete("set null").onUpdate("cascade"),
]);

export const taxFinancialMappings = pgTable("TaxFinancialMapping", {
  id: id(), taxId: text("taxId").notNull(), revenueNatureId: text("revenueNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(), defaultBankAccountId: text("defaultBankAccountId").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("TaxFinancialMapping_taxId_key").on(t.taxId),
  foreignKey({ name: "TaxFinancialMapping_taxId_fkey", columns: [t.taxId], foreignColumns: [taxes.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "TaxFinancialMapping_revenueNatureId_fkey", columns: [t.revenueNatureId], foreignColumns: [planningRevenueNatures.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "TaxFinancialMapping_resourceSourceId_fkey", columns: [t.resourceSourceId], foreignColumns: [planningResourceSources.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "TaxFinancialMapping_defaultBankAccountId_fkey", columns: [t.defaultBankAccountId], foreignColumns: [reconciliationBankAccounts.id] }).onDelete("restrict").onUpdate("cascade"),
]);
