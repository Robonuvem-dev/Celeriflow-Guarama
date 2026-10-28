import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";

/** Read-only projections of fiscal sources, used only by the citizen portal. */
export const portalTaxAssessments = pgTable("TaxAssessment", { id: text("id").primaryKey(), taxpayerId: text("taxpayerId").notNull(), assessmentNumber: text("assessmentNumber"), taxId: text("taxId").notNull(), year: integer("year").notNull(), status: text("status").notNull() });
export const portalTaxes = pgTable("Tax", { id: text("id").primaryKey(), name: text("name").notNull() });
export const portalTaxGuides = pgTable("TaxGuide", { id: text("id").primaryKey(), assessmentId: text("assessmentId").notNull(), guideNumber: text("guideNumber"), status: text("status").notNull(), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 18, scale: 2 }), dueDate: timestamp("dueDate", { precision: 3 }).notNull() });
export const portalOccasionalRequests = pgTable("NfseOccasionalRequest", { id: text("id").primaryKey(), providerTaxpayerId: text("providerTaxpayerId").notNull(), requestNumber: text("requestNumber").notNull(), status: text("status").notNull(), guideId: text("guideId"), invoiceId: text("invoiceId") });
export const portalItbiDeclarations = pgTable("ItbiDeclaration", { id: text("id").primaryKey(), processId: text("processId"), declarationNumber: text("declarationNumber").notNull(), status: text("status").notNull(), guideId: text("guideId") });
export const portalItbiParties = pgTable("ItbiParty", { id: text("id").primaryKey(), declarationId: text("declarationId").notNull(), taxpayerId: text("taxpayerId").notNull() });
export const portalTaxServiceActivities = pgTable("TaxServiceActivity", { id: text("id").primaryKey(), isActive: boolean("isActive").notNull() });
export const portalItbiTransactionTypes = pgTable("ItbiTransactionType", { id: text("id").primaryKey(), isActive: boolean("isActive").notNull() });
export const portalTaxPayments = pgTable("TaxPayment", { id: text("id").primaryKey(), guideId: text("guideId").notNull(), status: text("status").notNull(), amountPaidDecimal: exactNumeric("amountPaidDecimal", { precision: 18, scale: 2 }) });
export const portalDebtInstallments = pgTable("DebtInstallment", { id: text("id").primaryKey(), taxpayerId: text("taxpayerId").notNull(), status: text("status").notNull(), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 18, scale: 2 }), installmentsCount: integer("installmentsCount").notNull() });
