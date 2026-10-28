import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { PreventionPayload } from "@/lib/sst/prevention-policy";

export const sstPreventionRecords = pgTable("SstPreventionRecord", {
  id: text("id").primaryKey(), budgetUnitId: text("budgetUnitId").notNull(), kind: text("kind").$type<PreventionPayload["kind"]>().notNull(), title: text("title").notNull(), payload: jsonb("payload").$type<PreventionPayload>().notNull(), clinical: boolean("clinical").notNull().default(false), createdById: text("createdById").notNull(), submissionKey: text("submissionKey").notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("SstPreventionRecord_createdById_submissionKey_key").on(t.createdById, t.submissionKey)]);
