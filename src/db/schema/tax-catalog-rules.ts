import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Installed objects only: original catalog (2026-10-28) and the 156 historical
// SQL migrations are the authority. These runtime mappings install no DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const date = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => date("createdAt").notNull().defaultNow();
const updatedAt = () => date("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const catalogParameters = pgTable("TaxParameter", {
  id: id(), taxId: text("taxId").notNull(), code: text("code").notNull(), name: text("name").notNull(), calculationType: text("calculationType").notNull(), configuration: jsonb("configuration").$type<JsonValue>().notNull(), effectiveFrom: date("effectiveFrom").notNull(), effectiveUntil: date("effectiveUntil"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const catalogIntegrationEvents = pgTable("TaxIntegrationEvent", {
  id: id(), integrationCode: text("integrationCode").notNull(), eventType: text("eventType").notNull(), idempotencyKey: text("idempotencyKey").notNull(), protocol: text("protocol"), externalReference: text("externalReference"), status: text("status").notNull().default("RECEBIDO"), evidenceLevel: text("evidenceLevel").notNull().default("L0"), payload: jsonb("payload").$type<JsonValue>().notNull(), result: jsonb("result").$type<JsonValue>(), taxpayerId: text("taxpayerId"), economicRegistrationId: text("economicRegistrationId"), receivedAt: date("receivedAt").notNull().defaultNow(), processedAt: date("processedAt"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxIntegrationEvent_idempotencyKey_key").on(t.idempotencyKey)]);
export const catalogDocumentSequences = pgTable("TaxDocumentSequence", {
  id: id(), year: integer("year").notNull(), documentType: text("documentType").notNull(), currentValue: integer("currentValue").notNull().default(0), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxDocumentSequence_year_documentType_key").on(t.year, t.documentType)]);
export const catalogServiceRequests = pgTable("TaxServiceRequest", {
  id: id(), serviceType: text("serviceType").notNull(), status: text("status").notNull().default("EM_ANALISE_INTERNA"), taxpayerId: text("taxpayerId").notNull(), processId: text("processId"), documentId: text("documentId"), assessmentId: text("assessmentId"), licenseId: text("licenseId"), notes: text("notes"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const catalogAccessGrants = pgTable("DteAccessGrant", {
  id: id(), mailboxId: text("mailboxId").notNull(), authorizedTaxpayerId: text("authorizedTaxpayerId").notNull(), codeHash: text("codeHash").notNull(), codeLast4: text("codeLast4").notNull(), status: text("status").notNull().default("ATIVO"), validUntil: date("validUntil").notNull(), revokedAt: date("revokedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const catalogPowers = pgTable("DtePowerOfAttorney", {
  id: id(), grantorTaxpayerId: text("grantorTaxpayerId").notNull(), attorneyTaxpayerId: text("attorneyTaxpayerId").notNull(), establishmentCnpjs: jsonb("establishmentCnpjs").$type<JsonValue>().notNull(), status: text("status").notNull().default("PENDENTE_ACEITE"), legitimacyMode: text("legitimacyMode").notNull(), legitimacyEvidence: text("legitimacyEvidence"), officialCertificateValidated: boolean("officialCertificateValidated").notNull().default(false), documentId: text("documentId"), validFrom: date("validFrom").notNull().defaultNow(), validUntil: date("validUntil"), acceptedAt: date("acceptedAt"), refusedAt: date("refusedAt"), revokedAt: date("revokedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const catalogPowerEvents = pgTable("DtePowerOfAttorneyEvent", {
  id: id(), powerOfAttorneyId: text("powerOfAttorneyId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
