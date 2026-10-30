import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const assetCatalogRecords = pgTable("AssetCatalogRecord", {
  id: text("id").primaryKey().$defaultFn(createId),
  kind: text("kind").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  year: integer("year").notNull(), departmentId: text("departmentId").notNull(),
  details: jsonb("details").$type<Record<string, string>>().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("AssetCatalogRecord_scope_code_key").on(table.kind, table.year, table.departmentId, table.code)]);

export const materialRequestRevisions = pgTable("MaterialRequestRevision", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull(), operation: text("operation").notNull(), previousStatus: text("previousStatus").notNull(), reason: text("reason").notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
