import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { documents } from "./registry";
import { documentFolders, documentVersions } from "./document-workflow";
import { users } from "./identity";
import { centralRecords } from "./signature-central";
import type { GedQuery, GedZone } from "@/lib/documents/ged-policy";

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });
export const gedEntries = pgTable("GedEntry", {
  documentId: text("documentId").primaryKey().references(() => documents.id, { onDelete: "restrict" }),
  ownerId: text("ownerId").references(() => users.id, { onDelete: "restrict" }), departmentId: text("departmentId"),
  origin: text("origin").notNull().default("GED"), legacyReference: text("legacyReference").notNull().default(""),
  filename: text("filename").notNull(), mimeType: text("mimeType").notNull(), byteLength: integer("byteLength").notNull().default(0),
  editorialStatus: text("editorialStatus").notNull().default("RASCUNHO"), archived: boolean("archived").notNull().default(false),
  createdAt: instant("createdAt").notNull().defaultNow(),
}, t => [index("GedEntry_scope_idx").on(t.ownerId, t.departmentId)]);
export const gedFolderAccess = pgTable("GedFolderAccess", {
  folderId: text("folderId").primaryKey().references(() => documentFolders.id, { onDelete: "restrict" }),
  ownerId: text("ownerId").references(() => users.id, { onDelete: "restrict" }), departmentId: text("departmentId"),
});
export const gedUploads = pgTable("GedUpload", {
  id: text("id").primaryKey(), ownerId: text("ownerId").notNull().references(() => users.id),
  batchId: text("batchId").notNull(), filename: text("filename").notNull(), title: text("title").notNull(),
  classCode: text("classCode").notNull(), folderId: text("folderId"), legacyReference: text("legacyReference").notNull().default(""),
  pathname: text("pathname").notNull().unique(), url: text("url"), documentId: text("documentId").references(() => documents.id),
  checkinDocumentId: text("checkinDocumentId"), status: text("status").notNull().default("PENDING"), error: text("error"),
  createdAt: instant("createdAt").notNull().defaultNow(),
}, t => [index("GedUpload_batch_idx").on(t.ownerId, t.batchId)]);
export const gedCheckouts = pgTable("GedCheckout", {
  id: text("id").primaryKey().$defaultFn(createId), documentId: text("documentId").notNull().references(() => documents.id),
  versionId: text("versionId").notNull().references(() => documentVersions.id), ownerId: text("ownerId").notNull().references(() => users.id),
  createdAt: instant("createdAt").notNull().defaultNow(), closedAt: instant("closedAt"), comment: text("comment"),
}, t => [uniqueIndex("GedCheckout_active_key").on(t.documentId).where(sql`${t.closedAt} IS NULL`)]);
export const gedVersionFiles = pgTable("GedVersionFile", {
  versionId: text("versionId").primaryKey().references(() => documentVersions.id, { onDelete: "restrict" }),
  filename: text("filename").notNull(), mimeType: text("mimeType").notNull(), byteLength: integer("byteLength").notNull(),
  authorId: text("authorId").notNull().references(() => users.id), comment: text("comment").notNull().default(""),
});
export const gedPages = pgTable("GedTextPage", {
  id: text("id").primaryKey().$defaultFn(createId), versionId: text("versionId").notNull().references(() => documentVersions.id),
  page: integer("page").notNull(), text: text("text").notNull(), normalized: text("normalized").notNull(), method: text("method").notNull(),
  zones: jsonb("zones").$type<Array<GedZone & { text: string; confidence: number | null }>>().notNull().default([]),
}, t => [uniqueIndex("GedTextPage_version_page_key").on(t.versionId, t.page)]);
export const gedJobs = pgTable("GedProcessingJob", {
  id: text("id").primaryKey().$defaultFn(createId), versionId: text("versionId").notNull().references(() => documentVersions.id),
  status: text("status").notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0),
  leaseUntil: instant("leaseUntil"), leaseToken: text("leaseToken"), error: text("error"),
  updatedAt: instant("updatedAt").notNull().defaultNow(),
}, t => [uniqueIndex("GedProcessingJob_version_key").on(t.versionId)]);
export const gedSmartFolders = pgTable("GedSmartFolder", {
  id: text("id").primaryKey().$defaultFn(createId), ownerId: text("ownerId").notNull().references(() => users.id),
  name: text("name").notNull(), query: jsonb("query").$type<GedQuery>().notNull(), shared: boolean("shared").notNull().default(false),
  createdAt: instant("createdAt").notNull().defaultNow(),
});
export const gedThesaurus = pgTable("GedThesaurus", {
  id: text("id").primaryKey().$defaultFn(createId), term: text("term").notNull().unique(), equivalents: jsonb("equivalents").$type<string[]>().notNull(),
});
export type GedReviewAssignments = Record<"ELABORACAO" | "CONSENSO" | "APROVACAO" | "HOMOLOGACAO", string[]>;
export const gedReviews = pgTable("GedReview", {
  id: text("id").primaryKey().$defaultFn(createId), documentId: text("documentId").notNull().references(() => documents.id),
  versionId: text("versionId").notNull().references(() => documentVersions.id), assignments: jsonb("assignments").$type<GedReviewAssignments>().notNull(),
  stage: integer("stage").notNull().default(0), status: text("status").notNull().default("ACTIVE"),
  dueAt: instant("dueAt").notNull(), createdById: text("createdById").notNull().references(() => users.id), createdAt: instant("createdAt").notNull().defaultNow(),
}, t => [uniqueIndex("GedReview_active_key").on(t.documentId).where(sql`${t.status} = 'ACTIVE'`)]);
export const gedDecisions = pgTable("GedReviewDecision", {
  id: text("id").primaryKey().$defaultFn(createId), reviewId: text("reviewId").notNull().references(() => gedReviews.id),
  stage: integer("stage").notNull(), userId: text("userId").notNull().references(() => users.id),
  decision: text("decision").notNull(), comment: text("comment").notNull(), createdAt: instant("createdAt").notNull().defaultNow(),
}, t => [uniqueIndex("GedReviewDecision_once_key").on(t.reviewId, t.stage, t.userId)]);
export const gedTemplates = pgTable("GedTemplateVersion", {
  id: text("id").primaryKey().$defaultFn(createId), templateKey: text("templateKey").notNull(), version: integer("version").notNull(),
  name: text("name").notNull(), content: text("content").notNull(), sourceUrl: text("sourceUrl"),
  ownerId: text("ownerId").notNull().references(() => users.id), departmentId: text("departmentId"),
  markers: jsonb("markers").$type<string[]>().notNull(), createdAt: instant("createdAt").notNull().defaultNow(),
}, t => [uniqueIndex("GedTemplateVersion_number_key").on(t.templateKey, t.version)]);
export const gedGenerated = pgTable("GedGeneratedDocument", {
  documentId: text("documentId").primaryKey().references(() => documents.id), templateVersionId: text("templateVersionId").notNull().references(() => gedTemplates.id),
  values: jsonb("values").$type<Record<string, string>>().notNull(),
});
export const gedCentralArchives = pgTable("GedCentralArchive", {
  recordId: text("recordId").primaryKey().references(() => centralRecords.id, { onDelete: "restrict" }),
  documentId: text("documentId").notNull().unique().references(() => documents.id, { onDelete: "restrict" }),
  versionId: text("versionId").notNull().references(() => documentVersions.id, { onDelete: "restrict" }),
  createdAt: instant("createdAt").notNull().defaultNow(),
});
export const gedCentralSignatures = pgTable("GedCentralSignature", {
  recordId: text("recordId").primaryKey().references(() => centralRecords.id, { onDelete: "restrict" }),
  versionId: text("versionId").notNull().references(() => documentVersions.id, { onDelete: "restrict" }),
}, t => [index("GedCentralSignature_version_idx").on(t.versionId)]);
export const gedOperationLeases = pgTable("GedOperationLease", {
  documentId: text("documentId").primaryKey().references(() => documents.id, { onDelete: "restrict" }),
  token: text("token").notNull(), expiresAt: instant("expiresAt").notNull(),
});
