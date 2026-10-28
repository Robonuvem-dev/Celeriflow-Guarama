import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { constructionCases } from "./construction-core";
import { constructionExternalApplications } from "./construction-portal";
import { documentVersions } from "./document-workflow";
import { users } from "./identity";
import { documents } from "./registry";

export const constructionInternalOpeningDocuments = pgTable("ConstructionInternalOpeningDocument", {
  id: text("id").primaryKey(), requestKey: text("requestKey").notNull(), uploadKey: text("uploadKey").notNull().unique(), actorId: text("actorId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }), formVersion: integer("formVersion").notNull(), label: text("label").notNull(), documentId: text("documentId").notNull().unique().references(() => documents.id, { onDelete: "restrict", onUpdate: "no action" }), documentVersionId: text("documentVersionId").notNull().unique().references(() => documentVersions.id, { onDelete: "restrict", onUpdate: "no action" }), hashSha256: text("hashSha256").notNull(), filename: text("filename").notNull(), mimeType: text("mimeType").notNull(), caseId: text("caseId").references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("ConstructionInternalOpeningDocument_actorId_requestKey_label_idx").on(t.actorId, t.requestKey, t.label), index("ConstructionInternalOpeningDocument_caseId_idx").on(t.caseId)]);

export const constructionExternalDocuments = pgTable("ConstructionExternalDocument", {
  id: text("id").primaryKey().$defaultFn(createId), applicationId: text("applicationId").notNull().references(() => constructionExternalApplications.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), label: text("label").notNull(), documentId: text("documentId").notNull().unique().references(() => documents.id, { onDelete: "restrict", onUpdate: "no action" }), documentVersionId: text("documentVersionId").notNull().unique().references(() => documentVersions.id, { onDelete: "restrict", onUpdate: "no action" }), hashSha256: text("hashSha256").notNull(), filename: text("filename").notNull(), mimeType: text("mimeType").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("ConstructionExternalDocument_applicationId_label_idx").on(t.applicationId, t.label)]);
