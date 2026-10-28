import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "../ids";
import { users } from "./identity";

export const internalNotifications = pgTable("ProtocolNotification", {
  id: text("id").primaryKey().$defaultFn(createId), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }), processId: text("processId"),
  sourceModule: text("sourceModule").notNull().default("PROCESSOS"), entityType: text("entityType").notNull().default("PROCESS"), entityId: text("entityId").notNull(), type: text("type").notNull(), title: text("title").notNull(), message: text("message").notNull(),
  priority: text("priority").notNull().default("NORMAL"), dedupeKey: text("dedupeKey"), readAt: timestamp("readAt", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("ProtocolNotification_userId_readAt_createdAt_idx").on(table.userId, table.readAt, table.createdAt), index("ProtocolNotification_sourceModule_entityType_entityId_createdAt_idx").on(table.sourceModule, table.entityType, table.entityId, table.createdAt), index("ProtocolNotification_userId_dedupeKey_idx").on(table.userId, table.dedupeKey), uniqueIndex("ProtocolNotification_userId_dedupeKey_unique").on(table.userId, table.dedupeKey).where(sql`${table.dedupeKey} IS NOT NULL`)]);
