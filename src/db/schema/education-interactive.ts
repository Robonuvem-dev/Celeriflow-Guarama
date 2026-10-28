import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const pedagogicalCatalogItems = pgTable("PedagogicalCatalogItem", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), description: text("description").notNull(), schoolYear: text("schoolYear").notNull(), type: text("type").notNull(), status: text("status").notNull().default("Ativo"),
  instructions: text("instructions").notNull(), content: jsonb("content").$type<JsonValue>().notNull(), durationSeconds: integer("durationSeconds"), subjectId: text("subjectId"), ...timestamps(),
});
export const pedagogicalReleases = pgTable("PedagogicalRelease", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("Publicado"), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
  catalogItemId: text("catalogItemId").notNull(), teacherId: text("teacherId").notNull(), classId: text("classId"), studentId: text("studentId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const pedagogicalAttempts = pgTable("PedagogicalAttempt", {
  id: text("id").primaryKey().$defaultFn(createId), startedAt: timestamp("startedAt", { precision: 3 }).notNull().defaultNow(), completedAt: timestamp("completedAt", { precision: 3 }), score: doublePrecision("score").notNull().default(0),
  correctAnswers: integer("correctAnswers").notNull().default(0), incorrectAnswers: integer("incorrectAnswers").notNull().default(0), answers: jsonb("answers").$type<JsonValue>().notNull(), releaseId: text("releaseId").notNull(), studentId: text("studentId").notNull(),
});
export const educationSupportRequests = pgTable("EducationSupportRequest", {
  id: text("id").primaryKey().$defaultFn(createId), protocol: text("protocol").notNull(), requesterName: text("requesterName").notNull(), requesterEmail: text("requesterEmail").notNull(),
  subject: text("subject").notNull(), description: text("description").notNull(), status: text("status").notNull().default("Aberto"), response: text("response"), ...timestamps(),
}, t => [uniqueIndex("EducationSupportRequest_protocol_key").on(t.protocol)]);
