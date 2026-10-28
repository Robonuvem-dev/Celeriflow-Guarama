import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const controlPlans = pgTable("InternalControlPlan", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), reference: text("reference").notNull(), status: text("status").notNull().default("ABERTO"),
  dueAt: timestamp("dueAt", { precision: 3 }), ownerId: text("ownerId").notNull(), budgetUnitId: text("budgetUnitId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const controlFindings = pgTable("InternalControlFinding", {
  id: text("id").primaryKey().$defaultFn(createId), planId: text("planId").notNull(), title: text("title").notNull(), description: text("description").notNull(), status: text("status").notNull().default("PENDENTE"),
  dueAt: timestamp("dueAt", { precision: 3 }), responsibleId: text("responsibleId"), evidenceDocumentId: text("evidenceDocumentId"), resolvedAt: timestamp("resolvedAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const controlEvents = pgTable("InternalControlEvent", {
  id: text("id").primaryKey().$defaultFn(createId), planId: text("planId").notNull(), findingId: text("findingId"), eventType: text("eventType").notNull(), actorId: text("actorId").notNull(), reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
