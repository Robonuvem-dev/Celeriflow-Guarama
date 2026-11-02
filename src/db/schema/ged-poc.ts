import { pgTable, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import type { IndexField } from "@/lib/documents/ged-admin-policy";

export const gedTypeDefinitions = pgTable("GedTypeDefinition", {
  id: text("id").primaryKey(), classId: text("classId").notNull(), version: integer("version").notNull(),
  fields: jsonb("fields").$type<IndexField[]>().notNull(), policy: jsonb("policy").$type<{ retentionMonths: number | null; validityDays: number | null; alertDays: number; rankWeight: number; preserveVersions: true }>().notNull(),
  createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export const gedMetadata = pgTable("GedMetadata", {
  documentId: text("documentId").primaryKey(), definitionId: text("definitionId"), values: jsonb("values").$type<Record<string, string | number | boolean>>().notNull().default({}),
  tags: jsonb("tags").$type<string[]>().notNull().default([]), validUntil: timestamp("validUntil", { withTimezone: true }), responsibleId: text("responsibleId"),
  alertDays: integer("alertDays").notNull().default(30), deletedAt: timestamp("deletedAt", { withTimezone: true }), purgedAt: timestamp("purgedAt", { withTimezone: true }), inheritAccess: boolean("inheritAccess").notNull().default(true),
});
