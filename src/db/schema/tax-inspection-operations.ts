import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Projections of installed historical tables, not a migration or new DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });

export const inspectionCredentials = pgTable("NfseCredentialRequest", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), economicRegistrationId: text("economicRegistrationId").notNull(), serviceActivityId: text("serviceActivityId").notNull(), status: text("status").notNull().default("SOLICITADO"), requestedAt: timestamp("requestedAt", { precision: 3 }).notNull().defaultNow(), analyzedAt: timestamp("analyzedAt", { precision: 3 }), enabledAt: timestamp("enabledAt", { precision: 3 }), decisionReason: text("decisionReason"), termsVersion: text("termsVersion").notNull().default("DEMO-1"), termsAcceptedAt: timestamp("termsAcceptedAt", { precision: 3 }).notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), analyzedByUsuarioId: text("analyzedByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const inspectionCredentialEvents = pgTable("NfseCredentialEvent", {
  id: id(), credentialId: text("credentialId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const inspectionRpsBatches = pgTable("NfseRpsBatch", {
  id: id(), batchNumber: text("batchNumber").notNull(), providerTaxpayerId: text("providerTaxpayerId").notNull(), source: text("source").notNull(), status: text("status").notNull().default("RECEBIDO"), signaturePolicy: text("signaturePolicy").notNull().default("INTERNAL_ALLOWED"), signatureStatus: text("signatureStatus").notNull().default("NAO_EXIGIDA"), documentId: text("documentId"), payloadHash: text("payloadHash").notNull(), protocol: text("protocol").notNull(), receivedAt: timestamp("receivedAt", { precision: 3 }).notNull().defaultNow(), processedAt: timestamp("processedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("NfseRpsBatch_batchNumber_key").on(t.batchNumber), uniqueIndex("NfseRpsBatch_protocol_key").on(t.protocol)]);
export const inspectionRpsItems = pgTable("NfseRpsItem", {
  id: id(), batchId: text("batchId").notNull(), rpsNumber: text("rpsNumber").notNull(), status: text("status").notNull().default("RECEBIDO"), payload: jsonb("payload").$type<JsonValue>().notNull(), invoiceId: text("invoiceId"), replacedRpsNumber: text("replacedRpsNumber"), cancelledAt: timestamp("cancelledAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("NfseRpsItem_batchId_rpsNumber_key").on(t.batchId, t.rpsNumber)]);
export const inspectionDmsDeclarations = pgTable("NfseDmsDeclaration", {
  id: id(), protocol: text("protocol").notNull(), taxpayerId: text("taxpayerId").notNull(), economicRegistrationId: text("economicRegistrationId"), competence: text("competence").notNull(), direction: text("direction").notNull(), channel: text("channel").notNull(), detailMode: text("detailMode").notNull(), status: text("status").notNull().default("PROTOCOLADA"), noMovement: boolean("noMovement").notNull().default(false), rectifiesDeclarationId: text("rectifiesDeclarationId"), serviceValueDecimal: money("serviceValueDecimal").notNull().default(sql`0`), deductionValueDecimal: money("deductionValueDecimal").notNull().default(sql`0`), ownIssDecimal: money("ownIssDecimal").notNull().default(sql`0`), retainedIssDecimal: money("retainedIssDecimal").notNull().default(sql`0`), payload: jsonb("payload").$type<JsonValue>().notNull(), createdByUsuarioId: text("createdByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("NfseDmsDeclaration_protocol_key").on(t.protocol)]);
export const inspectionOccasionalRequests = pgTable("NfseOccasionalRequest", {
  id: id(), requestNumber: text("requestNumber").notNull(), providerTaxpayerId: text("providerTaxpayerId").notNull(), takerTaxpayerId: text("takerTaxpayerId"), serviceActivityId: text("serviceActivityId").notNull(), status: text("status").notNull().default("SOLICITADA"), serviceDescription: text("serviceDescription").notNull(), serviceValueDecimal: money("serviceValueDecimal").notNull(), deductionValueDecimal: money("deductionValueDecimal").notNull().default(sql`0`), taxAmountDecimal: money("taxAmountDecimal").notNull(), paymentRequired: boolean("paymentRequired").notNull().default(true), assessmentId: text("assessmentId"), guideId: text("guideId"), invoiceId: text("invoiceId"), decisionReason: text("decisionReason"), approvedAt: timestamp("approvedAt", { precision: 3 }), releasedAt: timestamp("releasedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("NfseOccasionalRequest_requestNumber_key").on(t.requestNumber)]);
export const inspectionDeductionCredits = pgTable("NfseDeductionCredit", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), economicRegistrationId: text("economicRegistrationId"), creditType: text("creditType").notNull(), originDocument: text("originDocument").notNull(), constructionReference: text("constructionReference"), originalAmountDecimal: money("originalAmountDecimal").notNull(), availableAmountDecimal: money("availableAmountDecimal").notNull(), status: text("status").notNull().default("DISPONIVEL"), documentId: text("documentId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("NfseDeductionCredit_taxpayerId_originDocument_key").on(t.taxpayerId, t.originDocument)]);
export const inspectionDeductionConsumptions = pgTable("NfseDeductionConsumption", {
  id: id(), creditId: text("creditId").notNull(), invoiceId: text("invoiceId").notNull(), amountDecimal: money("amountDecimal").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("NfseDeductionConsumption_creditId_invoiceId_key").on(t.creditId, t.invoiceId)]);
export const inspectionActivities = pgTable("TaxServiceActivity", {
  id: id(), taxId: text("taxId").notNull(), code: text("code").notNull(), name: text("name").notNull(), issRate: exactNumeric("issRate", { precision: 9, scale: 6 }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const inspectionDeclarations = pgTable("TaxDeclaration", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), economicRegistrationId: text("economicRegistrationId"), activityId: text("activityId").notNull(), competence: timestamp("competence", { precision: 3 }).notNull(), serviceValueDecimal: money("serviceValueDecimal").notNull(), deductionValueDecimal: money("deductionValueDecimal").notNull().default(sql`0`), issValueDecimal: money("issValueDecimal").notNull(), status: text("status").notNull().default("APURADA_INTERNA"), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(), createdAt: createdAt(), updatedAt: updatedAt(), realEstateId: text("realEstateId"),
});
