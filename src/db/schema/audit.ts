import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { users } from "./identity";

export const auditEvents = pgTable("AuditEvent", {
  id: text("id").primaryKey().$defaultFn(createId),
  eventType: text("eventType").notNull(),
  targetType: text("targetType").notNull(),
  targetId: text("targetId").notNull(),
  actorUsuarioId: text("actorUsuarioId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [
  index("AuditEvent_createdAt_idx").on(table.createdAt),
  index("AuditEvent_eventType_createdAt_idx").on(table.eventType, table.createdAt),
  index("AuditEvent_actorUsuarioId_createdAt_idx").on(table.actorUsuarioId, table.createdAt),
  index("AuditEvent_targetType_targetId_createdAt_idx").on(table.targetType, table.targetId, table.createdAt),
]);
