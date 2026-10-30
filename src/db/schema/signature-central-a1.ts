import { boolean, check, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "../ids";
import { digitalCertificates } from "./document-workflow";

// Deliberately independent of the central core schema: no reciprocal imports.
export const centralA1Integrations = pgTable("SignatureCentralA1Integration", {
  id: text("id").primaryKey().$defaultFn(createId),
  certificateId: text("certificateId").notNull().references(() => digitalCertificates.id, { onDelete: "restrict" }),
  kind: text("kind").$type<"A1_ECPF" | "A1_ECNPJ">().notNull(),
  alias: text("alias").notNull(), ownerName: text("ownerName").notNull(), documentId: text("documentId").notNull(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("SignatureCentralA1Integration_certificate_key").on(t.certificateId), check("SignatureCentralA1Integration_kind_document_check", sql`(${t.kind} = 'A1_ECPF' AND ${t.documentId} ~ '^[0-9]{11}$') OR (${t.kind} = 'A1_ECNPJ' AND ${t.documentId} ~ '^[0-9]{14}$')`)]);
