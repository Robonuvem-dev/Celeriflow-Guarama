import { randomUUID } from "node:crypto";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const transparencyPublications = pgTable("TransparencyPublication", {
  id: text("id").primaryKey().$defaultFn(createId), publicKey: text("publicKey").notNull().unique().$defaultFn(randomUUID),
  collectionSlug: text("collectionSlug").notNull(), entity: text("entity").notNull(), year: integer("year").notNull(),
  title: text("title").notNull(), group: text("group").notNull(), referencePeriod: text("referencePeriod").notNull(),
  documentKind: text("documentKind").notNull().default("OUTRO"), legalStage: text("legalStage").notNull().default("REFERENCIA"),
  source: text("source").notNull().default("DOCUMENTOS"), status: text("status").notNull().default("DRAFT"), values: jsonb("values").notNull(),
  version: integer("version").notNull().default(1), order: integer("order").notNull().default(0),
  fileUrl: text("fileUrl"), filePathname: text("filePathname"), filename: text("filename"), contentType: text("contentType"), sha256: text("sha256"), linkUrl: text("linkUrl"),
  publishedAt: timestamp("publishedAt", { precision: 3 }), withdrawnAt: timestamp("withdrawnAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [index("TransparencyPublication_collectionSlug_entity_year_status_idx").on(t.collectionSlug, t.entity, t.year, t.status)]);

export const transparencyPageFeedback = pgTable("TransparencyPageFeedback", {
  id: text("id").primaryKey().$defaultFn(createId), submissionKey: text("submissionKey").notNull().unique(),
  page: text("page").notNull(), collectionSlug: text("collectionSlug"), rating: integer("rating").notNull(), comment: text("comment").notNull().default(""),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("TransparencyPageFeedback_createdAt_idx").on(t.createdAt), index("TransparencyPageFeedback_page_createdAt_idx").on(t.page, t.createdAt)]);

export const transparencyAccesses = pgTable("TransparencyAccess", {
  id: text("id").primaryKey().$defaultFn(createId), collectionSlug: text("collectionSlug").notNull(), entity: text("entity").notNull(),
  source: text("source").notNull(), year: integer("year").notNull(), ip: text("ip").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("TransparencyAccess_createdAt_idx").on(t.createdAt)]);

export const transparencyCriteria = pgTable("TransparencyCriterion", {
  id: text("id").primaryKey(), cycle: integer("cycle").notNull(), matrix: text("matrix").notNull(), dimension: text("dimension").notNull(),
  code: text("code").notNull(), title: text("title").notNull(), importance: text("importance").notNull(), facets: jsonb("facets").notNull(),
  applicableEntities: jsonb("applicableEntities").notNull(), sourceUrl: text("sourceUrl").notNull(), sourceHash: text("sourceHash").notNull(),
});
export const transparencyCriterionEvidence = pgTable("TransparencyCriterionEvidence", {
  id: text("id").primaryKey().$defaultFn(createId), criterionId: text("criterionId").notNull(), entity: text("entity").notNull(), year: integer("year").notNull(),
  status: text("status").notNull().default("UNVERIFIED"), urls: jsonb("urls").notNull(), notes: text("notes").notNull(), reviewedById: text("reviewedById").notNull(),
  reviewedAt: timestamp("reviewedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("TransparencyCriterionEvidence_criterionId_entity_year_key").on(t.criterionId, t.entity, t.year)]);

export const transparencyNativeBindings = pgTable("TransparencyNativeBinding", {
  id: text("id").primaryKey().$defaultFn(createId), publicKey: text("publicKey").notNull().unique().$defaultFn(randomUUID),
  collectionSlug: text("collectionSlug").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(), governmentEntityId: text("governmentEntityId").notNull(),
  enabled: boolean("enabled").notNull().default(true), sourceReference: text("sourceReference").notNull(), details: jsonb("details").notNull(), createdById: text("createdById").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("TransparencyNativeBinding_collectionSlug_sourceType_sourceId_key").on(t.collectionSlug, t.sourceType, t.sourceId)]);

export const publicNotices = pgTable("PublicNotice", {
  id: text("id").primaryKey().$defaultFn(createId), sourceModule: text("sourceModule").notNull(), sourceEntityId: text("sourceEntityId").notNull(), title: text("title").notNull(), category: text("category").notNull(),
  publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(), validationCode: text("validationCode").notNull().unique(), publishedByUsuarioId: text("publishedByUsuarioId").notNull(),
}, t => [uniqueIndex("PublicNotice_sourceModule_sourceEntityId_key").on(t.sourceModule, t.sourceEntityId)]);
