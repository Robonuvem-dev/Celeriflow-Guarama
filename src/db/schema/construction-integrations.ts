import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { constructionCases } from "./construction-core";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();

export const constructionFederalExports = pgTable("ConstructionFederalExport", {
  id: id(), requestKey: text("requestKey").notNull().unique(), scope: text("scope").notNull(), period: text("period").notNull(), version: integer("version").notNull(), layout: text("layout").notNull().default("MUNICIPAL_DEMO_JSON_V1"), payload: text("payload").notNull(), hashSha256: text("hashSha256").notNull(), validationSnapshot: jsonb("validationSnapshot").$type<JsonValue>().notNull(), rectifiesId: text("rectifiesId").references((): AnyPgColumn => constructionFederalExports.id, { onDelete: "restrict", onUpdate: "no action" }), reason: text("reason"), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("ConstructionFederalExport_scope_period_version_key").on(t.scope, t.period, t.version)]);

export const constructionFederalExportItems = pgTable("ConstructionFederalExportItem", {
  id: id(), exportId: text("exportId").notNull().references(() => constructionFederalExports.id, { onDelete: "restrict", onUpdate: "no action" }), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }),
}, t => [uniqueIndex("ConstructionFederalExportItem_exportId_caseId_key").on(t.exportId, t.caseId)]);

export const constructionFederalExportReceipts = pgTable("ConstructionFederalExportReceipt", {
  id: id(), exportId: text("exportId").notNull().references(() => constructionFederalExports.id, { onDelete: "restrict", onUpdate: "no action" }), protocol: text("protocol").notNull(), destination: text("destination").notNull(), submittedAt: timestamp("submittedAt", { precision: 3 }).notNull(), evidenceUrl: text("evidenceUrl").notNull(), evidenceHash: text("evidenceHash").notNull(), notes: text("notes").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("ConstructionFederalExportReceipt_exportId_protocol_key").on(t.exportId, t.protocol)]);

export const constructionPlanExtractions = pgTable("ConstructionPlanExtraction", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), filename: text("filename").notNull(), sourceUrl: text("sourceUrl").notNull(), sourceHash: text("sourceHash").notNull(), engine: text("engine").notNull(), model: text("model").notNull(), status: text("status").notNull(), pages: jsonb("pages").$type<JsonValue>().notNull(), measurements: jsonb("measurements").$type<JsonValue>().notNull(), comparison: jsonb("comparison").$type<JsonValue>().notNull(), limitations: jsonb("limitations").$type<JsonValue>().notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionPlanExtraction_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
