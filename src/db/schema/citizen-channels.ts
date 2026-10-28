import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const transparencyCitizenRequests = pgTable("TransparencyCitizenRequest", {
  id: text("id").primaryKey().$defaultFn(createId), protocol: text("protocol").notNull().unique(), accessHash: text("accessHash").notNull().unique(), type: text("type").notNull(), entity: text("entity").notNull().default("prefeitura"), name: text("name"), email: text("email"), subject: text("subject").notNull(), message: text("message").notNull(),
  status: text("status").notNull().default("RECEBIDO"), response: text("response"), respondedAt: timestamp("respondedAt", { precision: 3 }), dueAt: timestamp("dueAt", { precision: 3 }).notNull().defaultNow(), outcome: text("outcome"), extendedAt: timestamp("extendedAt", { precision: 3 }), extensionReason: text("extensionReason"),
  nativeTicketId: text("nativeTicketId").unique(), nativeOmbudsmanId: text("nativeOmbudsmanId").unique(), processId: text("processId"), requestKeyHash: text("requestKeyHash").unique(), inputHash: text("inputHash"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const transparencyCitizenAppeals = pgTable("TransparencyCitizenAppeal", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull(), level: integer("level").notNull(), message: text("message").notNull(), status: text("status").notNull().default("RECEBIDO"), response: text("response"), dueAt: timestamp("dueAt", { precision: 3 }).notNull(), respondedAt: timestamp("respondedAt", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("TransparencyCitizenAppeal_requestId_level_key").on(t.requestId, t.level)]);
export const transparencySatisfactions = pgTable("TransparencySatisfaction", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull().unique(), rating: integer("rating").notNull(), qualityRating: integer("qualityRating"), deadlineRating: integer("deadlineRating"), comment: text("comment").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
