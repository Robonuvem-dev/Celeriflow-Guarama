import { doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

// Installed tables; runtime mappings only. The historical SQL remains the DDL authority.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const actionActiveDebts = pgTable("ActiveDebt", {
  id: id(), originDebtType: text("originDebtType").notNull(), year: integer("year").notNull(), originalValue: doublePrecision("originalValue").notNull(), originalValueDecimal: exactNumeric("originalValueDecimal", { precision: 18, scale: 2 }), updatedValue: doublePrecision("updatedValue").notNull(), updatedValueDecimal: exactNumeric("updatedValueDecimal", { precision: 18, scale: 2 }), cdaNumber: text("cdaNumber"), sourceKey: text("sourceKey"), status: text("status").notNull().default("Inscrita"), taxpayerId: text("taxpayerId").notNull(), assessmentId: text("assessmentId"), bankTransactionId: text("bankTransactionId"), integrationEventId: text("integrationEventId"), collectionReference: text("collectionReference"), createdAt: createdAt(), updatedAt: updatedAt(), budgetUnitId: text("budgetUnitId"), governmentEntityId: text("governmentEntityId"),
});
export const actionTaxCertificates = pgTable("TaxCertificate", {
  id: id(), certificateType: text("certificateType").notNull(), authCode: text("authCode").notNull(), validUntil: timestamp("validUntil", { precision: 3 }).notNull(), status: text("status").notNull().default("Emitida"), taxpayerId: text("taxpayerId").notNull(), documentId: text("documentId"), createdAt: createdAt(), updatedAt: updatedAt(),
});

// Minimal typed projections for document readers; never used to generate DDL.
export const actionExclusions = pgTable("SimplesExclusionCase", {
  id: text("id").notNull(), taxpayerId: text("taxpayerId").notNull(), competence: text("competence").notNull(), reason: text("reason").notNull(), calendarRevenueDecimal: exactNumeric("calendarRevenueDecimal", { precision: 18, scale: 2 }).notNull(), legalLimitDecimal: exactNumeric("legalLimitDecimal", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull(), documentId: text("documentId"), dteMessageId: text("dteMessageId"), externalReceipt: text("externalReceipt"), exportContent: text("exportContent"),
});
export const actionAgreements = pgTable("TaxInstallmentAgreement", {
  id: text("id").notNull(), agreementNumber: text("agreementNumber").notNull(), agreementType: text("agreementType").notNull(), status: text("status").notNull(), ruleId: text("ruleId").notNull(), totalAgreementDecimal: exactNumeric("totalAgreementDecimal", { precision: 18, scale: 2 }).notNull(), paidDecimal: exactNumeric("paidDecimal", { precision: 18, scale: 2 }).notNull(), balanceDecimal: exactNumeric("balanceDecimal", { precision: 18, scale: 2 }).notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
export const actionInstallmentRules = pgTable("TaxInstallmentRule", { id: text("id").notNull(), name: text("name").notNull(), legalReference: text("legalReference").notNull() });
export const actionQuotas = pgTable("TaxInstallmentQuota", {
  agreementId: text("agreementId").notNull(), quotaNumber: integer("quotaNumber").notNull(), dueDate: timestamp("dueDate", { precision: 3 }).notNull(), originalDecimal: exactNumeric("originalDecimal", { precision: 18, scale: 2 }).notNull(), paidDecimal: exactNumeric("paidDecimal", { precision: 18, scale: 2 }).notNull(), balanceDecimal: exactNumeric("balanceDecimal", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull(),
});
export const actionBenefitGrants = pgTable("TaxBenefitGrant", {
  id: text("id").notNull(), taxpayerId: text("taxpayerId").notNull(), ruleId: text("ruleId").notNull(), creditDecimal: exactNumeric("creditDecimal", { precision: 18, scale: 2 }).notNull(), reductionDecimal: exactNumeric("reductionDecimal", { precision: 18, scale: 2 }).notNull(), renunciationDecimal: exactNumeric("renunciationDecimal", { precision: 18, scale: 2 }).notNull(), finalAmountDecimal: exactNumeric("finalAmountDecimal", { precision: 18, scale: 2 }).notNull(), grantedAt: timestamp("grantedAt", { precision: 3 }).notNull(),
});
export const actionCdaVersions = pgTable("TaxCdaVersion", { activeDebtId: text("activeDebtId").notNull(), versionNumber: integer("versionNumber").notNull(), annotation: text("annotation"), signatureStatus: text("signatureStatus").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull() });
export const actionDebtEvents = pgTable("TaxActiveDebtEvent", { activeDebtId: text("activeDebtId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull() });
