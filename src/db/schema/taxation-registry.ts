import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { taxpayers } from "./registry";

export const taxRegistryEntries = pgTable("TaxRegistryEntry", {
  id: text("id").primaryKey().$defaultFn(createId), entityType: text("entityType").notNull(), entityId: text("entityId").notNull(), category: text("category").notNull(), title: text("title").notNull(), data: jsonb("data").$type<JsonValue>().notNull(), status: text("status").notNull().default("ATIVO"), source: text("source").notNull().default("INTERNO"), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull().defaultNow(), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), processId: text("processId"), documentId: text("documentId"), actorUsuarioId: text("actorUsuarioId"), reviewedByUsuarioId: text("reviewedByUsuarioId"), reviewedAt: timestamp("reviewedAt", { precision: 3 }), version: integer("version").notNull().default(1), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index("TaxRegistryEntry_entityType_entityId_category_status_idx").on(t.entityType, t.entityId, t.category, t.status),
  index("TaxRegistryEntry_processId_idx").on(t.processId),
  index("TaxRegistryEntry_documentId_idx").on(t.documentId),
  index("TaxRegistryEntry_effectiveFrom_effectiveUntil_idx").on(t.effectiveFrom, t.effectiveUntil),
  uniqueIndex("TaxRegistryEntry_accountant_version_key").on(t.entityId, t.version).where(sql`${t.entityType}='TAXPAYER' AND ${t.category}='ACCOUNTANT'`),
  uniqueIndex("TaxRegistryEntry_property_restriction_version_key").on(t.entityId, t.version).where(sql`${t.entityType}='REAL_ESTATE' AND ${t.category}='PROPERTY_EDIT_RESTRICTION'`),
]);

export const taxLicenses = pgTable("License", {
  id: text("id").primaryKey().$defaultFn(createId), licenseType: text("licenseType").notNull(), status: text("status").notNull().default("Solicitado"), issueDate: timestamp("issueDate", { precision: 3 }), validUntil: timestamp("validUntil", { precision: 3 }), qrCode: text("qrCode"), taxpayerId: text("taxpayerId").notNull().references(() => taxpayers.id, { onDelete: "restrict", onUpdate: "cascade" }), economicRegistrationId: text("economicRegistrationId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
