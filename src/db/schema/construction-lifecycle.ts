import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const constructionPropertyUpdates = pgTable("ConstructionPropertyUpdate", {
  id: text("id").primaryKey().$defaultFn(createId), completionId: text("completionId").notNull(), requestKey: text("requestKey").notNull(), processId: text("processId").notNull(), status: text("status").notNull().default("PENDING"),
  proposedSnapshot: jsonb("proposedSnapshot").notNull(), beforeSnapshot: jsonb("beforeSnapshot"), afterSnapshot: jsonb("afterSnapshot"), createdBy: text("createdBy").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), appliedBy: text("appliedBy"), appliedAt: timestamp("appliedAt", { precision: 3 }),
}, table => [uniqueIndex("ConstructionPropertyUpdate_completionId_key").on(table.completionId), uniqueIndex("ConstructionPropertyUpdate_requestKey_key").on(table.requestKey), uniqueIndex("ConstructionPropertyUpdate_processId_key").on(table.processId)]);
