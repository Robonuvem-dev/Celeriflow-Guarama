import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";
import { taxes, taxAssessments } from "./taxation-core";
import { taxpayers, realEstates } from "./registry";
import { constructionCases } from "./construction-core";

export const constructionTaxRuleVersions = pgTable("ConstructionTaxRuleVersion", {
  id: text("id").primaryKey().$defaultFn(createId), kind: text("kind").notNull(), version: integer("version").notNull(), taxId: text("taxId").notNull().references(() => taxes.id, { onDelete: "restrict", onUpdate: "cascade" }), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }), fixedAmount: exactNumeric("fixedAmount", { precision: 18, scale: 2 }).notNull(), amountPerSquareMeter: exactNumeric("amountPerSquareMeter", { precision: 18, scale: 4 }).notNull(), legalBasis: text("legalBasis").notNull(), guideInstructions: text("guideInstructions").notNull(), demonstration: boolean("demonstration").notNull().default(true), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionTaxRuleVersion_kind_version_key").on(t.kind, t.version)]);

export const constructionFees = pgTable("ConstructionFee", {
  id: text("id").primaryKey().$defaultFn(createId), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "cascade" }), kind: text("kind").notNull(), revision: integer("revision").notNull().default(0), cycleKey: text("cycleKey").notNull().default("INITIAL"), requestKey: text("requestKey").notNull().unique(), ruleId: text("ruleId").notNull().references(() => constructionTaxRuleVersions.id, { onDelete: "restrict", onUpdate: "cascade" }), taxpayerId: text("taxpayerId").notNull().references(() => taxpayers.id, { onDelete: "restrict", onUpdate: "cascade" }), realEstateId: text("realEstateId").notNull().references(() => realEstates.id, { onDelete: "restrict", onUpdate: "cascade" }), assessmentId: text("assessmentId").unique().references(() => taxAssessments.id, { onDelete: "restrict", onUpdate: "cascade" }), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(), exemptionReason: text("exemptionReason"), createdBy: text("createdBy").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionFee_caseId_kind_cycleKey_revision_key").on(t.caseId, t.kind, t.cycleKey, t.revision)]);
