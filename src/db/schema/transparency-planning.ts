import { date, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";

/** Read-only public-source projections; authoritative DDL stays in SQL history. */
export const transparencyPlanningInstrumentKind = pgEnum("PlanningInstrumentKind", ["PPA", "LDO", "LOA"]);
export const transparencyPlanningLineKind = pgEnum("PlanningLineKind", ["REVENUE", "EXPENSE", "TRANSFER"]);
export const transparencyBudgetLaws = pgTable("AnnualBudgetLaw", { id: text("id").primaryKey(), lawNumber: text("lawNumber").notNull(), financialYearId: text("financialYearId").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull() });
export const transparencyRevenueForecasts = pgTable("AnnualBudgetRevenueForecast", { id: text("id").primaryKey(), annualBudgetLawId: text("annualBudgetLawId").notNull(), code: text("code").notNull(), name: text("name").notNull(), estimatedValue: exactNumeric("estimatedValue", { precision: 18, scale: 2 }).notNull() });
export const transparencyPlanningInstruments = pgTable("PlanningInstrument", { id: text("id").primaryKey(), governmentEntityId: text("governmentEntityId").notNull(), kind: transparencyPlanningInstrumentKind("kind").notNull(), annualBudgetLawId: text("annualBudgetLawId"), startYear: integer("startYear").notNull() });
export const transparencyPlanningLines = pgTable("PlanningBudgetLine", { id: text("id").primaryKey(), instrumentId: text("instrumentId").notNull(), kind: transparencyPlanningLineKind("kind").notNull(), code: text("code").notNull(), year: integer("year").notNull(), revenueNatureId: text("revenueNatureId"), appropriationId: text("appropriationId"), functionCode: text("functionCode"), subfunctionCode: text("subfunctionCode"), originalValue: exactNumeric("originalValue", { precision: 18, scale: 2 }).notNull() });
export const transparencyPlanningMovements = pgTable("PlanningLineMovement", { id: text("id").primaryKey(), lineId: text("lineId").notNull(), effectiveAt: date("effectiveAt", { mode: "date" }).notNull(), value: exactNumeric("value", { precision: 18, scale: 2 }).notNull() });
export const transparencyRevenueNatures = pgTable("RevenueNature", { id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull() });
export const publicPlanningReportSnapshots = pgTable("PlanningReportSnapshot", { id: text("id").primaryKey(), instrumentId: text("instrumentId").notNull(), reportType: text("reportType").notNull() });
export const publicPlanningReportPublications = pgTable("PlanningReportPublication", {
  id: text("id").primaryKey(), snapshotId: text("snapshotId").notNull(), publicKey: text("publicKey").notNull(),
  title: text("title").notNull(), format: text("format").notNull(), status: text("status").notNull(),
  fileUrl: text("fileUrl"), fileHash: text("fileHash"), filename: text("filename").notNull(), contentType: text("contentType").notNull(),
  publishedAt: timestamp("publishedAt", { precision: 3 }),
});
