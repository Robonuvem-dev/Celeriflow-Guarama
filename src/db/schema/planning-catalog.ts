import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const planningCatalogVersions = pgTable("PlanningCatalogVersion", {
  id: text("id").primaryKey().$defaultFn(createId), year: integer("year").notNull(), label: text("label").notNull(),
  normativeReference: text("normativeReference").notNull(), sourceHash: text("sourceHash").notNull(),
  status: text("status").notNull().default("DRAFT"), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("PlanningCatalogVersion_year_sourceHash_key").on(table.year, table.sourceHash)]);

export const planningCatalogEntries = pgTable("PlanningCatalogEntry", {
  id: text("id").primaryKey().$defaultFn(createId), versionId: text("versionId").notNull().references(() => planningCatalogVersions.id, { onDelete: "restrict", onUpdate: "no action" }),
  kind: text("kind").notNull(), code: text("code").notNull(), name: text("name").notNull(), parentCode: text("parentCode"),
  degree: integer("degree").notNull(), canonicalId: text("canonicalId").notNull(), attributes: jsonb("attributes").$type<JsonValue>().notNull(),
}, table => [uniqueIndex("PlanningCatalogEntry_versionId_kind_code_key").on(table.versionId, table.kind, table.code), uniqueIndex("PlanningCatalogEntry_versionId_kind_canonicalId_key").on(table.versionId, table.kind, table.canonicalId), index("PlanningCatalogEntry_canonical_version_idx").on(table.kind, table.canonicalId, table.versionId)]);

export const planningEntityUnits = pgTable("PlanningEntityUnit", {
  budgetUnitId: text("budgetUnitId").primaryKey(), governmentEntityId: text("governmentEntityId").notNull(),
}, table => [index("PlanningEntityUnit_governmentEntityId_idx").on(table.governmentEntityId)]);

/** Read-only projection for selectors; the physical BudgetUnit is shared with finance. */
export const planningBudgetUnitLabels = pgTable("BudgetUnit", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
});
