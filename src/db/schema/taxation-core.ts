import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";
import { documents, realEstates, taxpayers } from "./registry";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });

export const taxes = pgTable("Tax", {
  id: id(), name: text("name").notNull(), taxType: text("taxType").notNull(), isActive: boolean("isActive").notNull().default(true), code: text("code"), governmentLevel: text("governmentLevel"), revenueNature: text("revenueNature"), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), description: text("description"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("Tax_code_key").on(t.code)]);

export const economicRegistrations = pgTable("EconomicRegistration", {
  id: id(), municipalInsc: text("municipalInsc").notNull(), primaryCnae: text("primaryCnae"), taxRegime: text("taxRegime"), status: text("status").notNull().default("Ativo"), startDate: timestamp("startDate", { precision: 3 }), taxpayerId: text("taxpayerId").notNull().references(() => taxpayers.id, { onDelete: "restrict", onUpdate: "cascade" }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("EconomicRegistration_municipalInsc_key").on(t.municipalInsc)]);

export const taxAssessments = pgTable("TaxAssessment", {
  id: id(), year: integer("year").notNull(), originalValue: doublePrecision("originalValue").notNull(), originalValueDecimal: money("originalValueDecimal"), assessmentNumber: text("assessmentNumber"), competence: timestamp("competence", { precision: 3 }), taxableBaseDecimal: money("taxableBaseDecimal"), rate: exactNumeric("rate", { precision: 9, scale: 6 }), discountValueDecimal: money("discountValueDecimal"), interestValueDecimal: money("interestValueDecimal"), penaltyValueDecimal: money("penaltyValueDecimal"), correctionValueDecimal: money("correctionValueDecimal"), finalValueDecimal: money("finalValueDecimal"), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>(), status: text("status").notNull().default("LanÃ§ado"), taxId: text("taxId").notNull().references(() => taxes.id, { onDelete: "restrict", onUpdate: "cascade" }), taxpayerId: text("taxpayerId").notNull().references(() => taxpayers.id, { onDelete: "restrict", onUpdate: "cascade" }), realEstateId: text("realEstateId").references(() => realEstates.id, { onDelete: "set null", onUpdate: "cascade" }), economicRegistrationId: text("economicRegistrationId").references(() => economicRegistrations.id, { onDelete: "set null", onUpdate: "cascade" }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxAssessment_assessmentNumber_key").on(t.assessmentNumber)]);

export const taxGuides = pgTable("TaxGuide", {
  id: id(), barcode: text("barcode"), totalValue: doublePrecision("totalValue").notNull(), totalValueDecimal: money("totalValueDecimal"), guideNumber: text("guideNumber"), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>(), documentId: text("documentId").references(() => documents.id, { onDelete: "set null", onUpdate: "cascade" }), dueDate: timestamp("dueDate", { precision: 3 }).notNull(), status: text("status").notNull().default("Emitida"), assessmentId: text("assessmentId").notNull().references(() => taxAssessments.id, { onDelete: "restrict", onUpdate: "cascade" }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("TaxGuide_barcode_key").on(t.barcode), uniqueIndex("TaxGuide_guideNumber_key").on(t.guideNumber)]);

export const taxInfractions = pgTable("Infraction", {
  id: id(), infractionType: text("infractionType").notNull(), penaltyValue: doublePrecision("penaltyValue").notNull(), penaltyValueDecimal: money("penaltyValueDecimal"), defenseDeadline: timestamp("defenseDeadline", { precision: 3 }), status: text("status").notNull().default("Emitido"), taxpayerId: text("taxpayerId").notNull().references(() => taxpayers.id, { onDelete: "restrict", onUpdate: "cascade" }), createdAt: createdAt(), updatedAt: updatedAt(),
});
