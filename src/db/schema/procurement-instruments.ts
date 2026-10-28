import { doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
const timestamps = () => ({ id: text("id").primaryKey().$defaultFn(createId), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });

export const procurementCovenants = pgTable("Covenant", {
  ...timestamps(), number: text("number").notNull(), grantor: text("grantor").notNull(), description: text("description").notNull(), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 18, scale: 2 }).notNull(), startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(), status: text("status").notNull().default("Ativo"), bankTransactionId: text("bankTransactionId"), integrationEventId: text("integrationEventId"), bankAccountExternalId: text("bankAccountExternalId"), bankAccountId: text("bankAccountId"),
}, table => [uniqueIndex("Covenant_number_key").on(table.number)]);
export const instrumentMeasurements = pgTable("InstrumentMeasurement", {
  ...timestamps(), contractId: text("contractId"), covenantId: text("covenantId"), number: integer("number").notNull(), description: text("description"), periodStart: timestamp("periodStart", { precision: 3 }), periodEnd: timestamp("periodEnd", { precision: 3 }), measuredAt: timestamp("measuredAt", { precision: 3 }).notNull().defaultNow(), status: text("status").notNull().default("Rascunho"), quantity: doublePrecision("quantity"), unit: text("unit"), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(), documentId: text("documentId"),
}, table => [uniqueIndex("InstrumentMeasurement_contractId_number_key").on(table.contractId, table.number), uniqueIndex("InstrumentMeasurement_covenantId_number_key").on(table.covenantId, table.number)]);

export const instrumentResponsibilityGroups = pgTable("InstrumentResponsibilityGroup", {
  ...timestamps(), contractId: text("contractId"), covenantId: text("covenantId"), name: text("name").notNull(), description: text("description"), status: text("status").notNull().default("Ativo"),
}, table => [uniqueIndex("InstrumentResponsibilityGroup_contractId_name_key").on(table.contractId, table.name), uniqueIndex("InstrumentResponsibilityGroup_covenantId_name_key").on(table.covenantId, table.name)]);

export const instrumentParties = pgTable("InstrumentParty", {
  ...timestamps(), contractId: text("contractId"), covenantId: text("covenantId"), role: text("role").notNull(), supplierId: text("supplierId"), personId: text("personId"), companyId: text("companyId"), employeeId: text("employeeId"), responsibilityGroupId: text("responsibilityGroupId"), status: text("status").notNull().default("Ativo"), activeFrom: timestamp("activeFrom", { precision: 3 }), activeTo: timestamp("activeTo", { precision: 3 }), notes: text("notes"),
});

export const instrumentMeasurementItems = pgTable("InstrumentMeasurementItem", {
  ...timestamps(), measurementId: text("measurementId").notNull(), purchaseProcessItemId: text("purchaseProcessItemId"), purchaseReceiptItemId: text("purchaseReceiptItemId"), description: text("description").notNull(), quantity: doublePrecision("quantity").notNull(), unit: text("unit").notNull(), unitValueDecimal: exactNumeric("unitValueDecimal", { precision: 18, scale: 2 }), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(),
}, table => [uniqueIndex("InstrumentMeasurementItem_purchaseReceiptItemId_key").on(table.purchaseReceiptItemId)]);

export const instrumentInstallments = pgTable("InstrumentInstallment", {
  ...timestamps(), contractId: text("contractId"), covenantId: text("covenantId"), number: integer("number").notNull(), dueDate: timestamp("dueDate", { precision: 3 }), periodStart: timestamp("periodStart", { precision: 3 }), periodEnd: timestamp("periodEnd", { precision: 3 }), quantity: doublePrecision("quantity"), unit: text("unit"), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("Programada"), paymentId: text("paymentId"),
}, table => [uniqueIndex("InstrumentInstallment_contractId_number_key").on(table.contractId, table.number), uniqueIndex("InstrumentInstallment_covenantId_number_key").on(table.covenantId, table.number)]);

/** Registry-owned read projection used to display the instrument's active representatives. */
export const procurementLegalRepresentatives = pgTable("LegalRepresentative", {
  id: text("id").primaryKey(), representationType: text("representationType").notNull(), status: text("status").notNull(), representedPersonId: text("representedPersonId"), representedCompanyId: text("representedCompanyId"), representativeId: text("representativeId").notNull(),
});
