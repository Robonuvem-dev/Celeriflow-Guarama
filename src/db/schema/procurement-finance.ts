import { doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";

// Read projections only. Finance owns all writes and constraints of these tables.
const timestamps = () => ({ id: text("id").primaryKey(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull() });
export const procurementReservations = pgTable("BudgetReservation", {
  ...timestamps(), number: text("number").notNull(), date: timestamp("date", { precision: 3 }).notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }),
  appropriationId: text("appropriationId").notNull(), expenseId: text("expenseId"), justification: text("justification"), status: text("status").notNull(),
});
export const procurementCommitments = pgTable("Commitment", {
  ...timestamps(), number: text("number").notNull(), date: timestamp("date", { precision: 3 }).notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), type: text("type").notNull(), history: text("history").notNull(),
  appropriationId: text("appropriationId").notNull(), supplierId: text("supplierId").notNull(), creditorId: text("creditorId"), processId: text("processId"), contractId: text("contractId"), purchaseProcessId: text("purchaseProcessId"), purchaseReceiptId: text("purchaseReceiptId"), covenantId: text("covenantId"), publicityCampaignId: text("publicityCampaignId"), fundedDebtId: text("fundedDebtId"), covenantNumber: text("covenantNumber"), publicityCampaignName: text("publicityCampaignName"), fundedDebtName: text("fundedDebtName"), reservationId: text("reservationId"), status: text("status").notNull(),
});
export const procurementSettlements = pgTable("Settlement", {
  ...timestamps(), date: timestamp("date", { precision: 3 }).notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), documentRef: text("documentRef"), fiscalDocumentNumber: text("fiscalDocumentNumber"), fiscalDocumentSeries: text("fiscalDocumentSeries"), fiscalDocumentIssueDate: timestamp("fiscalDocumentIssueDate", { precision: 3 }), fiscalDocumentAccessKey: text("fiscalDocumentAccessKey"), documentId: text("documentId"), commitmentId: text("commitmentId").notNull(), executionFinancialYearId: text("executionFinancialYearId"), payableCarryForwardId: text("payableCarryForwardId"), authorId: text("authorId").notNull(), status: text("status").notNull(), notes: text("notes"),
});
export const procurementSettlementRetentions = pgTable("SettlementRetention", {
  id: text("id").primaryKey(), settlementId: text("settlementId").notNull(), retentionRuleId: text("retentionRuleId").notNull(), type: text("type").notNull(), description: text("description"), calculationBaseDecimal: exactNumeric("calculationBaseDecimal", { precision: 18, scale: 2 }).notNull(), ratePercentage: exactNumeric("ratePercentage", { precision: 7, scale: 4 }).notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(), beneficiaryName: text("beneficiaryName").notNull(), beneficiaryDocument: text("beneficiaryDocument"), dueDate: timestamp("dueDate", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});

export const procurementPayments = pgTable("Payment", {
  id: text("id").primaryKey(), commitmentId: text("commitmentId").notNull(), settlementId: text("settlementId"), orderNumber: text("orderNumber").notNull(), date: timestamp("date", { precision: 3 }).notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), status: text("status").notNull(),
});
export const procurementCommitmentMovements = pgTable("CommitmentMovement", {
  id: text("id").primaryKey(), commitmentId: text("commitmentId").notNull(), type: text("type").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(),
});
