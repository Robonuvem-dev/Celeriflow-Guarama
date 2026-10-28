import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { people } from "./people";
import { users } from "./identity";

export const personMergeRequests = pgTable("PersonMergeRequest", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("PROPOSED"),
  sourcePersonId: text("sourcePersonId").notNull().references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }),
  targetPersonId: text("targetPersonId").notNull().references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }),
  proposedByUsuarioId: text("proposedByUsuarioId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  approvedByUsuarioId: text("approvedByUsuarioId").references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  reversedByUsuarioId: text("reversedByUsuarioId").references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  approvedAt: timestamp("approvedAt", { precision: 3 }), executedAt: timestamp("executedAt", { precision: 3 }), reversedAt: timestamp("reversedAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("PersonMergeRequest_status_createdAt_idx").on(table.status, table.createdAt), index("PersonMergeRequest_sourcePersonId_idx").on(table.sourcePersonId), index("PersonMergeRequest_targetPersonId_idx").on(table.targetPersonId)]);

export const personMergeLedger = pgTable("PersonMergeLedger", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull().references(() => personMergeRequests.id, { onDelete: "restrict", onUpdate: "cascade" }),
  eventType: text("eventType").notNull(),
  sourcePersonId: text("sourcePersonId").notNull().references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }),
  targetPersonId: text("targetPersonId").notNull().references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }),
  actorUsuarioId: text("actorUsuarioId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  manifest: jsonb("manifest").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("PersonMergeLedger_requestId_createdAt_idx").on(table.requestId, table.createdAt), index("PersonMergeLedger_sourcePersonId_createdAt_idx").on(table.sourcePersonId, table.createdAt), index("PersonMergeLedger_targetPersonId_createdAt_idx").on(table.targetPersonId, table.createdAt)]);
