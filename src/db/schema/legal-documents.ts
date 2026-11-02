import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "../ids";
import { legalTextVersions } from "./master-data";
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
