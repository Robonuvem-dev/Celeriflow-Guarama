import { doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";

// Read-only financial projections used by the planning execution reconciler.
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
export const planningBankAccounts = pgTable("BankAccount", { id: text("id").primaryKey(), budgetUnitId: text("budgetUnitId") });
export const planningReservations = pgTable("BudgetReservation", { id: text("id").primaryKey(), appropriationId: text("appropriationId").notNull(), status: text("status").notNull(), date: timestamp("date", { precision: 3 }).notNull(), value: doublePrecision("value").notNull(), valueDecimal: money("valueDecimal") });
export const planningCommitments = pgTable("Commitment", { id: text("id").primaryKey(), appropriationId: text("appropriationId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), valueDecimal: money("valueDecimal") });
export const planningCommitmentMovements = pgTable("CommitmentMovement", { id: text("id").primaryKey(), commitmentId: text("commitmentId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), type: text("type").notNull(), valueDecimal: money("valueDecimal").notNull() });
export const planningPayments = pgTable("Payment", { id: text("id").primaryKey(), commitmentId: text("commitmentId").notNull(), valueDecimal: money("valueDecimal") });
export const planningCashMovements = pgTable("TreasuryMovement", { id: text("id").primaryKey(), status: text("status").notNull(), date: timestamp("date", { precision: 3 }).notNull(), type: text("type").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId"), revenueId: text("revenueId"), valueDecimal: money("valueDecimal").notNull() });
export const planningRevenueFacts = pgTable("Revenue", { id: text("id").primaryKey(), revenueNatureId: text("revenueNatureId").notNull(), resourceSourceId: text("resourceSourceId").notNull(), bankAccountId: text("bankAccountId") });
export const planningRevenueReversals = pgTable("RevenueReversal", { id: text("id").primaryKey(), revenueId: text("revenueId").notNull(), treasuryMovementId: text("treasuryMovementId").notNull() });
export const planningRevenueRedistributions = pgTable("RevenueResourceRedistribution", { id: text("id").primaryKey(), revenueId: text("revenueId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), sourceResourceSourceId: text("sourceResourceSourceId").notNull(), destinationResourceSourceId: text("destinationResourceSourceId").notNull(), valueDecimal: money("valueDecimal").notNull() });
