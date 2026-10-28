import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Physical mappings from the historical baseline and the independent catalog.
// Importing these definitions performs no DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const debtEvents = pgTable("TaxActiveDebtEvent", {
  id: id(), activeDebtId: text("activeDebtId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: jsonb("payload").$type<JsonValue>(), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});
export const cdaVersions = pgTable("TaxCdaVersion", {
  id: id(), activeDebtId: text("activeDebtId").notNull(), versionNumber: integer("versionNumber").notNull(), cdaNumber: text("cdaNumber").notNull(), contentSnapshot: jsonb("contentSnapshot").$type<JsonValue>().notNull(), annotation: text("annotation"), signatureStatus: text("signatureStatus").notNull().default("NAO_ASSINADA"), signedByUsuarioId: text("signedByUsuarioId"), signedAt: timestamp("signedAt", { precision: 3 }), createdAt: createdAt(),
}, t => [uniqueIndex("TaxCdaVersion_activeDebtId_versionNumber_key").on(t.activeDebtId, t.versionNumber)]);
export const debtSuspensions = pgTable("TaxDebtSuspension", {
  id: id(), activeDebtId: text("activeDebtId").notNull(), reason: text("reason").notNull(), legalGround: text("legalGround"), startsAt: timestamp("startsAt", { precision: 3 }).notNull().defaultNow(), endsAt: timestamp("endsAt", { precision: 3 }), status: text("status").notNull().default("VIGENTE"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const debtPortfolios = pgTable("TaxDaPortfolio", {
  id: id(), name: text("name").notNull(), criteria: jsonb("criteria").$type<JsonValue>().notNull(), status: text("status").notNull().default("ATIVA"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const debtPortfolioItems = pgTable("TaxDaPortfolioItem", {
  id: id(), portfolioId: text("portfolioId").notNull(), activeDebtId: text("activeDebtId").notNull(), outstandingDecimal: exactNumeric("outstandingDecimal", { precision: 18, scale: 2 }).notNull(), addedAt: timestamp("addedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("TaxDaPortfolioItem_portfolioId_activeDebtId_key").on(t.portfolioId, t.activeDebtId)]);
export const protestBatches = pgTable("TaxProtestBatch", {
  id: id(), batchNumber: text("batchNumber").notNull(), status: text("status").notNull().default("PREPARADA"), fileContent: jsonb("fileContent").$type<JsonValue>().notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxProtestBatch_batchNumber_key").on(t.batchNumber)]);
export const protestItems = pgTable("TaxProtestItem", {
  id: id(), batchId: text("batchId").notNull(), activeDebtId: text("activeDebtId").notNull(), status: text("status").notNull().default("SELECIONADA"), returnCode: text("returnCode"), returnMessage: text("returnMessage"), consentIssuedAt: timestamp("consentIssuedAt", { precision: 3 }), resolvedAt: timestamp("resolvedAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxProtestItem_batchId_activeDebtId_key").on(t.batchId, t.activeDebtId)]);
export const executionBatches = pgTable("TaxExecutionBatch", {
  id: id(), batchNumber: text("batchNumber").notNull(), internalProtocol: text("internalProtocol").notNull(), status: text("status").notNull().default("MONTADO"), prosecutor: text("prosecutor"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxExecutionBatch_batchNumber_key").on(t.batchNumber), uniqueIndex("TaxExecutionBatch_internalProtocol_key").on(t.internalProtocol)]);
export const executionCases = pgTable("TaxExecutionCase", {
  id: id(), batchId: text("batchId"), activeDebtId: text("activeDebtId").notNull(), internalProtocol: text("internalProtocol").notNull(), status: text("status").notNull().default("EM_PREPARO"), prosecutor: text("prosecutor"), attorneyReference: text("attorneyReference"), mniStatus: text("mniStatus").notNull().default("NAO_ENVIADO"), attachments: jsonb("attachments").$type<JsonValue>().notNull().default([]), caseSnapshot: jsonb("caseSnapshot").$type<JsonValue>().notNull(), nextHearingAt: timestamp("nextHearingAt", { precision: 3 }), hearingNotes: text("hearingNotes"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxExecutionCase_internalProtocol_key").on(t.internalProtocol)]);
export const executionEvents = pgTable("TaxExecutionEvent", {
  id: id(), caseId: text("caseId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: jsonb("payload").$type<JsonValue>(), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});

// Exclusive read projections for the S9 BI; their writers belong to core Tax.
export const activeDebtAgreementTotals = pgTable("TaxInstallmentAgreement", {
  id: text("id").notNull(), status: text("status").notNull(), totalAgreementDecimal: exactNumeric("totalAgreementDecimal", { precision: 18, scale: 2 }).notNull(), balanceDecimal: exactNumeric("balanceDecimal", { precision: 18, scale: 2 }).notNull(), paidDecimal: exactNumeric("paidDecimal", { precision: 18, scale: 2 }).notNull(),
});
export const activeDebtDeclarationTotals = pgTable("TaxDeclaration", {
  id: text("id").notNull(), status: text("status").notNull(), competence: timestamp("competence", { precision: 3 }).notNull(), issValueDecimal: exactNumeric("issValueDecimal", { precision: 18, scale: 2 }).notNull(), activityId: text("activityId").notNull(),
});
