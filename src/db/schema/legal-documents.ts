import { integer, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "../ids";
import { legalTexts, legalTextVersions } from "./master-data";
import { documentVersions } from "./document-workflow";
import { users } from "./identity";

export const legalTextDocuments = pgTable("LegalTextDocument", {
  id: text("id").primaryKey().$defaultFn(createId),
  legalTextVersionId: text("legalTextVersionId").notNull().references(() => legalTextVersions.id, { onDelete: "restrict" }),
  documentVersionId: text("documentVersionId").notNull().references(() => documentVersions.id, { onDelete: "restrict" }),
  role: text("role").$type<"ORIGINAL" | "ATTACHMENT">().notNull(), label: text("label").notNull(),
  createdById: text("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("LegalTextDocument_legalTextVersionId_documentVersionId_key").on(t.legalTextVersionId, t.documentVersionId), uniqueIndex("LegalTextDocument_original_key").on(t.legalTextVersionId).where(sql`${t.role}='ORIGINAL'`), index("LegalTextDocument_version_idx").on(t.legalTextVersionId, t.createdAt, t.id)]);

export const legalTextDatabaseDocuments = pgTable("LegalTextDatabaseDocument", {
  id: text("id").primaryKey().$defaultFn(createId),
  legalTextVersionId: text("legalTextVersionId").notNull().references(() => legalTextVersions.id, { onDelete: "restrict" }),
  role: text("role").$type<"ORIGINAL" | "ATTACHMENT">().notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mimeType").notNull(),
  byteLength: integer("byteLength").notNull(),
  hashSha256: text("hashSha256").notNull(),
  createdById: text("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("LegalTextDatabaseDocument_legalTextVersionId_hashSha256_key").on(t.legalTextVersionId, t.hashSha256),
  uniqueIndex("LegalTextDatabaseDocument_original_key").on(t.legalTextVersionId).where(sql`${t.role}='ORIGINAL'`),
  index("LegalTextDatabaseDocument_version_idx").on(t.legalTextVersionId, t.createdAt, t.id),
]);

export const legalTextDatabaseDocumentBlobs = pgTable("LegalTextDatabaseDocumentBlob", {
  documentId: text("documentId").primaryKey().references(() => legalTextDatabaseDocuments.id, { onDelete: "restrict" }),
  contentBase64: text("contentBase64").notNull(),
});

export const legacyLegalTextSources = pgTable("LegacyLegalTextSource", {
  id: text("id").primaryKey().$defaultFn(createId),
  sourceApplication: text("sourceApplication").notNull(),
  externalId: text("externalId").notNull(),
  type: text("type").notNull(),
  number: text("number").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  governmentLevel: text("governmentLevel").notNull().default("MUNICIPAL"),
  issuingBody: text("issuingBody").notNull(),
  publicationDate: timestamp("publicationDate", { precision: 3 }),
  effectiveFrom: timestamp("effectiveFrom", { precision: 3 }),
  effectiveUntil: timestamp("effectiveUntil", { precision: 3 }),
  importedLegalTextId: text("importedLegalTextId").references(() => legalTexts.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("LegacyLegalTextSource_sourceApplication_externalId_key").on(t.sourceApplication, t.externalId),
  index("LegacyLegalTextSource_pending_idx").on(t.importedLegalTextId, t.createdAt, t.id),
]);
