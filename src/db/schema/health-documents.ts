import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const healthStandardDocuments = pgTable("HealthStandardDocument", {
  id: text("id").primaryKey().$defaultFn(createId), documentId: text("documentId").notNull(), category: text("category").notNull(), moduleCode: text("moduleCode").notNull(), isActive: boolean("isActive").notNull().default(true), addedByUsuarioId: text("addedByUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("HealthStandardDocument_documentId_key").on(t.documentId), index("HealthStandardDocument_moduleCode_category_isActive_idx").on(t.moduleCode, t.category, t.isActive), index("HealthStandardDocument_createdAt_idx").on(t.createdAt)]);
