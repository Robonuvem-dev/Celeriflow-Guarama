import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Existing SQL objects: scoped_instruments, import_batches, legal_operations and
// catalog_maintenance migrations. These projections do not introduce DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
export const catalogCommunityDemands = pgTable("PlanningCommunityDemand", {
  id: id(), hearingId: text("hearingId").notNull(), requesterName: text("requesterName").notNull(), email: text("email"), phone: text("phone"), neighborhood: text("neighborhood").notNull(), request: text("request").notNull(), responsibleUnitId: text("responsibleUnitId").notNull(), status: text("status").notNull().default("PENDING"), opinion: text("opinion"), createdAt: createdAt(),
});
export const catalogLegislativeAmendments = pgTable("PlanningLegislativeAmendment", {
  id: id(), instrumentId: text("instrumentId").notNull(), number: text("number").notNull(), date: date("date", { mode: "date" }).notNull(), objective: text("objective").notNull(), justification: text("justification").notNull(), councilorId: text("councilorId").notNull(), legalText: text("legalText").notNull(), status: text("status").notNull().default("DRAFT"), decidedById: text("decidedById"), decidedAt: timestamp("decidedAt", { precision: 3 }), createdById: text("createdById").notNull(), createdAt: createdAt(), versionNumber: integer("versionNumber").notNull().default(1), decisionReason: text("decisionReason"), effectiveAt: date("effectiveAt", { mode: "date" }), appliedAt: timestamp("appliedAt", { precision: 3 }), legalActNumber: text("legalActNumber"),
}, t => [uniqueIndex("PlanningLegislativeAmendment_instrumentId_number_key").on(t.instrumentId, t.number)]);
export const catalogAmendmentItems = pgTable("PlanningAmendmentItem", {
  id: id(), amendmentId: text("amendmentId").notNull(), lineId: text("lineId").notNull(), value: exactNumeric("value", { precision: 18, scale: 2 }).notNull(), sanctioned: boolean("sanctioned"),
}, t => [uniqueIndex("PlanningAmendmentItem_amendmentId_lineId_key").on(t.amendmentId, t.lineId)]);
export const catalogImportBatches = pgTable("PlanningImportBatch", {
  id: id(), sourceInstrumentId: text("sourceInstrumentId").notNull(), targetInstrumentId: text("targetInstrumentId").notNull(), mode: text("mode").notNull(), selectedLineIds: text("selectedLineIds").array().notNull(), sourceYear: integer("sourceYear"), targetYear: integer("targetYear").notNull(), realizedStage: text("realizedStage"), mapping: jsonb("mapping").$type<JsonValue>(), fingerprint: text("fingerprint").notNull(), submissionKey: text("submissionKey").notNull(), importedCount: integer("importedCount").notNull(), createdById: text("createdById").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("PlanningImportBatch_submissionKey_key").on(t.submissionKey)]);
// Only existence is consumed; service catalogue fields remain owned by Taxation.
export const catalogServiceTargets = pgTable("TaxServiceActivity", { id: text("id").primaryKey() });
