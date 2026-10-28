import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const reportTemplates = pgTable("ReportTemplate", {
  id: text("id").primaryKey().$defaultFn(createId),
  scope: text("scope").notNull().default("GLOBAL"),
  version: integer("version").notNull().default(1),
  fingerprint: text("fingerprint").notNull(),
  header: text("header").notNull().default(""),
  footer: text("footer").notNull().default(""),
  orientation: text("orientation").notNull().default("LANDSCAPE"),
  includeEmissionMetadata: boolean("includeEmissionMetadata").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("ReportTemplate_scope_key").on(table.scope), uniqueIndex("ReportTemplate_fingerprint_key").on(table.fingerprint)]);
