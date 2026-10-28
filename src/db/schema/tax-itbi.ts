import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

// Runtime mappings of installed objects in the 20261009232000 baseline and
// the independently captured physical catalog. This file does not install DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
const percent = (name: string) => exactNumeric(name, { precision: 9, scale: 6 });

export const itbiTransactionTypes = pgTable("ItbiTransactionType", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), rate: percent("rate").notNull(), damStage: text("damStage").notNull().default("APROVACAO"), cadastralUpdateMode: text("cadastralUpdateMode").notNull().default("MANUAL"), requiresDebtClearance: boolean("requiresDebtClearance").notNull().default(true), isActive: boolean("isActive").notNull().default(true), legalBasis: text("legalBasis"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ItbiTransactionType_code_key").on(t.code)]);
export const itbiDeclarations = pgTable("ItbiDeclaration", {
  id: id(), declarationNumber: text("declarationNumber").notNull(), status: text("status").notNull().default("RASCUNHO"), transactionTypeId: text("transactionTypeId").notNull(), realEstateId: text("realEstateId").notNull(), processId: text("processId"), protocolNumber: text("protocolNumber"), registryOffice: text("registryOffice"), transmissionScope: text("transmissionScope").notNull().default("INTEGRAL"), transmittedFraction: percent("transmittedFraction").notNull(), declaredPropertyValue: money("declaredPropertyValue").notNull(), taxableBase: money("taxableBase").notNull(), appliedRate: percent("appliedRate").notNull(), taxAmount: money("taxAmount").notNull(), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(), blockingTaxDebt: money("blockingTaxDebt").notNull().default(sql`0`), nonTaxDebtAmount: money("nonTaxDebtAmount").notNull().default(sql`0`), isLeasehold: boolean("isLeasehold").notNull().default(false), leaseholdDetails: text("leaseholdDetails"), cadastralUpdateMode: text("cadastralUpdateMode").notNull().default("MANUAL"), cadastralUpdatedAt: timestamp("cadastralUpdatedAt", { precision: 3 }), assessmentId: text("assessmentId"), guideId: text("guideId"), documentId: text("documentId"), analysisNotes: text("analysisNotes"), analyzedAt: timestamp("analyzedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ItbiDeclaration_declarationNumber_key").on(t.declarationNumber)]);
export const itbiParties = pgTable("ItbiParty", {
  id: id(), declarationId: text("declarationId").notNull(), taxpayerId: text("taxpayerId").notNull(), role: text("role").notNull(), participationPercent: percent("participationPercent"), liabilityType: text("liabilityType"), sortOrder: integer("sortOrder").notNull().default(0), createdAt: createdAt(),
});
export const itbiEvents = pgTable("ItbiEvent", {
  id: id(), declarationId: text("declarationId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: jsonb("payload").$type<JsonValue>(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const itbiDocumentSequences = pgTable("TaxDocumentSequence", {
  id: id(), year: integer("year").notNull(), documentType: text("documentType").notNull(), currentValue: integer("currentValue").notNull().default(0), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxDocumentSequence_year_documentType_key").on(t.year, t.documentType)]);
