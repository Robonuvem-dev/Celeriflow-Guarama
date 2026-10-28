import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { exactNumeric } from "../decimal";
import { constructionCases, constructionCatalogEntries, constructionReviews } from "./construction-core";
import { documents } from "./registry";
import { processes } from "./processes";

const id = () => text("id").primaryKey().$defaultFn(createId);
const instant = (name: string) => timestamp(name, { precision: 3 });
// Existing physical tables, including the later inspection-deadline migration.
export const constructionInspectionPlans = pgTable("ConstructionInspectionPlan", {
  id: id(), caseId: text("caseId").notNull().unique().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), reviewId: text("reviewId").notNull().references(() => constructionReviews.id, { onDelete: "restrict", onUpdate: "no action" }), inspectionTypes: jsonb("inspectionTypes").$type<JsonValue>().notNull(), definitionSnapshot: jsonb("definitionSnapshot").$type<JsonValue>().notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull().defaultNow(),
});
export const constructionInspections = pgTable("ConstructionInspection", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), inspectionTypeId: text("inspectionTypeId").notNull().references(() => constructionCatalogEntries.id, { onDelete: "restrict", onUpdate: "no action" }), sequence: integer("sequence").notNull(),
  requestedAt: instant("requestedAt").notNull().defaultNow(), scheduledAt: date("scheduledAt", { mode: "date" }), inspectedAt: date("inspectedAt", { mode: "date" }), status: text("status").notNull().default("REQUESTED"), requestNotes: text("requestNotes").notNull(), resultNotes: text("resultNotes"), definitionSnapshot: jsonb("definitionSnapshot").$type<JsonValue>().notNull(), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull().default({}), requestedBy: text("requestedBy").notNull(), inspectedBy: text("inspectedBy"), resultRequestKey: text("resultRequestKey").unique(),
  correctionDeadline: instant("correctionDeadline"), requirementNote: text("requirementNote"), correctionSnapshot: jsonb("correctionSnapshot").$type<JsonValue>(), reinspectionOfId: text("reinspectionOfId").references((): AnyPgColumn => constructionInspections.id, { onDelete: "restrict", onUpdate: "no action" }),
}, table => [uniqueIndex("ConstructionInspection_caseId_sequence_key").on(table.caseId, table.sequence), index("ConstructionInspection_caseId_inspectionTypeId_status_idx").on(table.caseId, table.inspectionTypeId, table.status)]);

export const constructionInspectionDeadlineExtensions = pgTable("ConstructionInspectionDeadlineExtension", {
  id: id(), requestKey: text("requestKey").notNull().unique(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), inspectionId: text("inspectionId").notNull().references(() => constructionInspections.id, { onDelete: "restrict", onUpdate: "no action" }), previousDeadline: instant("previousDeadline"), newDeadline: instant("newDeadline").notNull(), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull().defaultNow(),
}, table => [index("ConstructionInspectionDeadlineExtension_inspectionId_createdAt_idx").on(table.inspectionId, table.createdAt)]);

export const constructionCompletionSequences = pgTable("ConstructionCompletionSequence", {
  year: integer("year").primaryKey(), nextNumber: integer("nextNumber").notNull(),
});
export const constructionCompletions = pgTable("ConstructionCompletion", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), number: text("number").notNull().unique(), kind: text("kind").notNull(), completedAt: date("completedAt", { mode: "date" }).notNull(), area: exactNumeric("area", { precision: 14, scale: 4 }).notNull(), cumulativeArea: exactNumeric("cumulativeArea", { precision: 14, scale: 4 }).notNull(), remainingArea: exactNumeric("remainingArea", { precision: 14, scale: 4 }).notNull(), notes: text("notes").notNull(), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull(), debtSnapshot: jsonb("debtSnapshot").$type<JsonValue>().notNull(), occupancyDocumentId: text("occupancyDocumentId").unique().references(() => documents.id, { onDelete: "restrict", onUpdate: "no action" }), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull().defaultNow(),
}, table => [index("ConstructionCompletion_caseId_createdAt_idx").on(table.caseId, table.createdAt)]);

export const constructionPropertyUpdates = pgTable("ConstructionPropertyUpdate", {
  id: text("id").primaryKey().$defaultFn(createId), completionId: text("completionId").notNull().references(() => constructionCompletions.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull(), processId: text("processId").notNull().references(() => processes.id, { onDelete: "restrict", onUpdate: "no action" }), status: text("status").notNull().default("PENDING"),
  proposedSnapshot: jsonb("proposedSnapshot").$type<JsonValue>().notNull(), beforeSnapshot: jsonb("beforeSnapshot").$type<JsonValue>(), afterSnapshot: jsonb("afterSnapshot").$type<JsonValue>(), createdBy: text("createdBy").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), appliedBy: text("appliedBy"), appliedAt: timestamp("appliedAt", { precision: 3 }),
}, table => [uniqueIndex("ConstructionPropertyUpdate_completionId_key").on(table.completionId), uniqueIndex("ConstructionPropertyUpdate_requestKey_key").on(table.requestKey), uniqueIndex("ConstructionPropertyUpdate_processId_key").on(table.processId)]);
