import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Runtime mappings only. The installed catalog and historical SQL own the DDL,
// including CHECK constraints, foreign keys and immutable-evidence triggers.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
export const planningReportPublications = pgTable("PlanningReportPublication", {
  id: id(), snapshotId: text("snapshotId").notNull(), format: text("format").notNull(), publicKey: text("publicKey").notNull(),
  status: text("status").notNull().default("PENDING"), fileUrl: text("fileUrl"), fileHash: text("fileHash"), filename: text("filename").notNull(), contentType: text("contentType").notNull(), title: text("title").notNull(),
  kind: text("kind").notNull().default("REVIEW_COPY"), requestedById: text("requestedById").notNull(), reason: text("reason").notNull(),
  publishedAt: timestamp("publishedAt", { precision: 3 }), withdrawnAt: timestamp("withdrawnAt", { precision: 3 }), lastError: text("lastError"), attempts: integer("attempts").notNull().default(0),
  leaseToken: text("leaseToken"), leaseExpiresAt: timestamp("leaseExpiresAt", { precision: 3 }), createdAt: createdAt(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("PlanningReportPublication_publicKey_key").on(table.publicKey), uniqueIndex("PlanningReportPublication_snapshotId_format_key").on(table.snapshotId, table.format)]);

export const planningPublicationEvents = pgTable("PlanningPublicationEvent", {
  id: id(), publicationId: text("publicationId").notNull(), type: text("type").notNull(), actorId: text("actorId").notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(), createdAt: createdAt(),
});
